import type { FeatureBranch, SCCResponse, SCCStatsResponse } from "../../types";
import { BranchToggle } from "../ui/BranchToggle";
import { useEffect, useMemo, useRef, useState } from "react";
import { changeset } from "vega";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";
import type { VacpActionCall, VacpActionDescriptor, VacpActionResult, VacpRef } from "@vacp/core";

import {
  formatCompactClassLabel,
  getEmbeddingClassColors,
  getModelBandLabel,
  getModelClassLabels,
} from "../../constants/eegModel";
import { EEG_MODEL_NOTATION, EEG_MODEL_NOTATION_LABELS } from "../../constants/eegModelNotation";
import type {
  ChannelId,
  ModelBandPowerResponse,
  ModelBandPresentation,
  ModelBandPowerStatsMode,
  ModelBandPowerStatsResponse,
  ModelClassPresentation,
} from "../../types";
import { resizeVegaView, useVegaLayoutResize } from "../../utils/vegaLayout";
import { createVacpChartRefPrefix } from "../../vacp/appBridge";
import { registerVacpVegaLiteChart } from "../../vacp/registerVegaLiteChart";
import { ComponentStatusIndicator, MathFormula } from "../ui";

export interface TotalBandPowerChartProps {
  branch?: FeatureBranch;
  hasSCC?: boolean;
  onBranchChange?: (branch: FeatureBranch) => void;
  scc?: SCCResponse | null;
  sccStats?: SCCStatsResponse | null;
  bandPower: ModelBandPowerResponse | null;
  bandPowerStats: ModelBandPowerStatsResponse | null;
  bandPowerStatsMode: ModelBandPowerStatsMode;
  bandPowerStatsCohortLabel: string | null;
  isInterStatsUnavailable: boolean;
  isLoading: boolean;
  isLoadingStats: boolean;
  error: string | null;
  statsError: string | null;
  modelClasses: ModelClassPresentation[];
  modelBands: ModelBandPresentation[];
  selectedChannels: ChannelId[];
  selectedWindowIndex: number | null;
  predictionWindowCount: number;
  onChannelSelect: (channel: ChannelId) => void;
  onWindowSelect: (windowIndex: number) => void;
  onBandPowerStatsModeChange: (mode: ModelBandPowerStatsMode) => void;
  onBandPowerStatsCohortLabelChange: (label: string | null) => void;
}

const MIN_RELATIVE_POWER_FOR_DB = 1e-6;
const MIN_DB_DOMAIN = -40;
const BAND_POWER_DATA_NAME = "bandPowerValues";
const TOTAL_BAND_POWER_CHART_ID = "patient-view/total-band-power";
const SELECTED_WINDOW_SERIES = "Selected window value";
const REFERENCE_MEAN_SERIES = "Reference mean";
const REFERENCE_RANGE_SERIES = "+/-2sigma range";
const LEGEND_SERIES_FIELD = "series";
const LEGEND_SERIES_DOMAIN = [SELECTED_WINDOW_SERIES, REFERENCE_MEAN_SERIES, REFERENCE_RANGE_SERIES] as const;
const DEFAULT_RANGE_FILL = "rgb(14 116 144 / 13%)";
const DEFAULT_RANGE_STROKE = "#64748b";
const TOTAL_BAND_POWER_ACTIONS = {
  channelNext: "patient_view.total_band_power.channel_next",
  channelPrevious: "patient_view.total_band_power.channel_previous",
  channelSet: "patient_view.total_band_power.channel_set",
  windowNext: "patient_view.total_band_power.window_next",
  windowPrevious: "patient_view.total_band_power.window_previous",
  windowSet: "patient_view.total_band_power.window_set",
} as const;

interface BandPowerInteractionState {
  availableChannels: ChannelId[];
  selectedChannel: ChannelId | null;
  selectedWindowIndex: number | null;
  predictionWindowCount: number;
  onChannelSelect: (channel: ChannelId) => void;
  onWindowSelect: (windowIndex: number) => void;
}

export function TotalBandPowerChart({
  branch = "bp",
  hasSCC = false,
  onBranchChange,
  scc = null,
  sccStats = null,
  bandPower,
  bandPowerStats,
  bandPowerStatsMode,
  bandPowerStatsCohortLabel,
  isInterStatsUnavailable,
  isLoading,
  isLoadingStats,
  error,
  statsError,
  modelClasses,
  modelBands,
  selectedChannels,
  selectedWindowIndex,
  predictionWindowCount,
  onChannelSelect,
  onWindowSelect,
  onBandPowerStatsModeChange,
  onBandPowerStatsCohortLabelChange,
}: TotalBandPowerChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const interactionRef = useRef<BandPowerInteractionState>({
    availableChannels: [],
    selectedChannel: null,
    selectedWindowIndex: null,
    predictionWindowCount: 0,
    onChannelSelect,
    onWindowSelect,
  });
  const [plotHeight, setPlotHeight] = useState(240);
  useVegaLayoutResize(viewRef);

  const isSCC = branch === "scc";
  const measurement = isSCC ? scc : bandPower;
  const channels = measurement?.channels ?? [];
  const availableChannels = useMemo(() => channels.map((channel) => channel.channel), [channels]);
  const selectedChannel =
    selectedChannels.find((channel) => availableChannels.includes(channel)) ?? availableChannels[0] ?? null;

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.channel === selectedChannel) ?? channels[0] ?? null,
    [channels, selectedChannel],
  );
  const activeStatsChannel = useMemo(
    () =>
      (isSCC ? sccStats : bandPowerStats)?.channels.find((channel) => channel.channel === selectedChannel) ??
      (isSCC ? sccStats : bandPowerStats)?.channels[0] ??
      null,
    [bandPowerStats, sccStats, isSCC, selectedChannel],
  );
  const statsByBand = useMemo(
    () => new Map((activeStatsChannel?.bands ?? []).map((band) => [band.band, band])),
    [activeStatsChannel],
  );
  const classLabels = useMemo(() => getModelClassLabels(modelClasses), [modelClasses]);
  const activeStats = isSCC ? sccStats : bandPowerStats;
  const displayedCohortLabel = activeStats?.mode === "inter_patient" ? (activeStats.cohort_label ?? null) : null;
  const rangeColors = useMemo(
    () => getRangeColors(displayedCohortLabel, modelClasses),
    [displayedCohortLabel, modelClasses],
  );

  const values = useMemo(
    () =>
      (activeChannel?.bands ?? []).map((band, index) => {
        const stats = statsByBand.get(band.band);
        return {
          order: index,
          band: band.band,
          label: getModelBandLabel(band.band, modelBands),
          value: "mean_coherence" in band ? band.mean_coherence : toRelativePowerDb(band.relative_power),
          lower: stats ? ("lower_2sigma" in stats ? Math.max(0, stats.lower_2sigma) : stats.lower_2sigma_db) : null,
          rawLower: stats ? ("lower_2sigma" in stats ? stats.lower_2sigma : stats.lower_2sigma_db) : null,
          upper: stats ? ("upper_2sigma" in stats ? Math.min(1, stats.upper_2sigma) : stats.upper_2sigma_db) : null,
          rawUpper: stats ? ("upper_2sigma" in stats ? stats.upper_2sigma : stats.upper_2sigma_db) : null,
          referenceMean: stats ? ("mean" in stats ? stats.mean : stats.mean_db) : null,
          statsSampleCount: stats?.sample_count ?? null,
          rangeFill: rangeColors.fill,
          rangeStroke: rangeColors.stroke,
          range: `${band.start_hz.toFixed(1)}-${band.end_hz.toFixed(1)} Hz`,
        };
      }),
    [activeChannel, modelBands, rangeColors.fill, rangeColors.stroke, statsByBand],
  );
  const hasReferenceRange = values.some((value) => Number.isFinite(value.lower) && Number.isFinite(value.upper));
  const hasReferenceMean = values.some((value) => Number.isFinite(value.referenceMean));
  const valuesRef = useRef<typeof values>([]);
  const status = getBandPowerStatus({ bandPower: measurement, error, isLoading, isLoadingStats, statsError });

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (bandPowerStatsCohortLabel && !classLabels.includes(bandPowerStatsCohortLabel)) {
      onBandPowerStatsCohortLabelChange(null);
    }
  }, [bandPowerStatsCohortLabel, classLabels, onBandPowerStatsCohortLabelChange]);

  useEffect(() => {
    interactionRef.current = {
      availableChannels,
      selectedChannel,
      selectedWindowIndex,
      predictionWindowCount,
      onChannelSelect,
      onWindowSelect,
    };
  }, [availableChannels, onChannelSelect, onWindowSelect, predictionWindowCount, selectedChannel, selectedWindowIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const nextHeight = Math.max(180, Math.floor(entry.contentRect.height));
      setPlotHeight((current) => (current !== nextHeight ? nextHeight : current));
      resizeVegaView(viewRef.current);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!values.length || error || plotHeight <= 0) {
      viewRef.current = null;
      return;
    }

    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: "container",
      height: plotHeight,
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { name: BAND_POWER_DATA_NAME, values },
      layer: [
        ...(hasReferenceRange
          ? [
              {
                mark: {
                  type: "area" as const,
                  interpolate: "monotone" as const,
                },
                encoding: {
                  x: createBandAxisEncoding(),
                  color: {
                    field: "rangeFill",
                    type: "nominal" as const,
                    scale: null,
                    legend: null,
                  },
                  y: {
                    field: "lower",
                    type: "quantitative" as const,
                    axis: createPowerAxis(isSCC),
                    scale: createPowerScale(isSCC),
                  },
                  y2: { field: "upper" },
                },
              },
            ]
          : []),
        ...(hasReferenceMean
          ? [
              {
                mark: {
                  type: "line" as const,
                  interpolate: "monotone" as const,
                  strokeDash: [4, 3],
                  strokeWidth: 1.5,
                },
                encoding: {
                  x: createBandAxisEncoding(),
                  color: {
                    field: "rangeStroke",
                    type: "nominal" as const,
                    scale: null,
                    legend: null,
                  },
                  y: {
                    field: "referenceMean",
                    type: "quantitative" as const,
                    axis: createPowerAxis(isSCC),
                    scale: createPowerScale(isSCC),
                  },
                },
              },
            ]
          : []),
        {
          mark: {
            type: "line" as const,
            interpolate: "monotone" as const,
            color: isSCC ? "#9333a8" : "#0e7490",
            point: {
              filled: true,
              fill: isSCC ? "#9333a8" : "#0e7490",
              stroke: isSCC ? "#6b217b" : "#064e56",
              size: 74,
              strokeWidth: 2,
            },
            strokeWidth: 2.5,
          },
          encoding: {
            x: createBandAxisEncoding(),
            y: {
              field: "value",
              type: "quantitative" as const,
              axis: createPowerAxis(isSCC),
              scale: createPowerScale(isSCC),
            },
            tooltip: [
              { field: "band", type: "nominal", title: "Band" },
              { field: "range", type: "nominal", title: "Range" },
              { field: "percent", type: "quantitative", title: "Relative power (%)", format: ".2f" },
              {
                field: "value",
                type: "quantitative",
                title: isSCC ? "Mean coherence" : "Selected window (dB)",
                format: isSCC ? ".3f" : ".1f",
              },
              {
                field: "referenceMean",
                type: "quantitative",
                title: isSCC ? "Reference mean" : "Reference mean (dB)",
                format: isSCC ? ".3f" : ".1f",
              },
              {
                field: "rawLower",
                type: "quantitative",
                title: isSCC ? "−2σ (unclipped)" : "−2σ (dB)",
                format: isSCC ? ".3f" : ".1f",
              },
              {
                field: "rawUpper",
                type: "quantitative",
                title: isSCC ? "+2σ (unclipped)" : "+2σ (dB)",
                format: isSCC ? ".3f" : ".1f",
              },
              { field: "statsSampleCount", type: "quantitative", title: "Reference samples", format: ".0f" },
            ],
          },
        },
        createBandPowerLegendLayer(isSCC),
      ],
      config: {
        view: { stroke: null },
      },
    };

    let finalized = false;
    let unregisterVacp: (() => void) | null = null;
    const resultPromise = embed(container, spec, {
      actions: false,
      renderer: "svg",
    });

    resultPromise.catch(() => undefined);
    resultPromise
      .then((result) => {
        if (!finalized) {
          viewRef.current = result.view;
          resizeVegaView(result.view);
          result.view
            .change(
              BAND_POWER_DATA_NAME,
              changeset()
                .remove(() => true)
                .insert(valuesRef.current),
            )
            .runAsync()
            .catch(() => undefined);
          const chartRef = createVacpChartRefPrefix(TOTAL_BAND_POWER_CHART_ID);
          const channelRef = `${chartRef}/channel` as VacpRef;
          const windowRef = `${chartRef}/window` as VacpRef;
          unregisterVacp = registerVacpVegaLiteChart({
            root: container,
            view: result.view,
            spec,
            chartId: TOTAL_BAND_POWER_CHART_ID,
            title: isSCC ? "Patient View Mean Spectral Connectivity" : "Patient View Total Band Power",
            description: isSCC
              ? "Mean coherence of the selected electrode with all other electrodes, across SCC bands."
              : "Total band power for the selected patient window and EEG channel.",
            extraNodes: [
              {
                ref: channelRef,
                kind: "Selection",
                layer: "InteractionFeedbackLayer",
                title: "Selected total-band-power EEG channel",
              },
              {
                ref: windowRef,
                kind: "Selection",
                layer: "InteractionFeedbackLayer",
                title: "Selected total-band-power prediction window",
              },
            ],
            extraEdges: [
              { from: chartRef, to: channelRef, kind: "contains" },
              { from: chartRef, to: windowRef, kind: "contains" },
            ],
            extraActions: createBandPowerActionDescriptors({
              channelRef,
              windowRef,
              channels: interactionRef.current.availableChannels,
              predictionWindowCount: interactionRef.current.predictionWindowCount,
            }),
            executeExtraAction: (call) => executeBandPowerAction(call, interactionRef.current),
            getExtraState: () => ({
              [channelRef]: {
                availableChannels: interactionRef.current.availableChannels,
                selectedChannel: interactionRef.current.selectedChannel,
              },
              [windowRef]: {
                selectedWindowIndex: interactionRef.current.selectedWindowIndex,
                predictionWindowCount: interactionRef.current.predictionWindowCount,
              },
            }),
            getExtraSummary: () => ({
              [channelRef]: `Total band power channel=${interactionRef.current.selectedChannel ?? "none"}.`,
              [windowRef]: `Total band power window=${
                interactionRef.current.selectedWindowIndex === null
                  ? "none"
                  : interactionRef.current.selectedWindowIndex + 1
              }/${interactionRef.current.predictionWindowCount}.`,
            }),
          });
        }
      })
      .catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      unregisterVacp?.();
      unregisterVacp = null;
      viewRef.current = null;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [error, hasReferenceMean, hasReferenceRange, plotHeight, values.length, isSCC]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !values.length) {
      return;
    }

    view
      .change(
        BAND_POWER_DATA_NAME,
        changeset()
          .remove(() => true)
          .insert(values),
      )
      .runAsync()
      .catch(() => undefined);
  }, [values]);

  return (
    <div className="topology-bandpower">
      <div className="topology-bandpower-header">
        <div>
          <h4 className="topology-bandpower-title">{isSCC ? "Mean Spectral Connectivity" : "Total Band Power"}</h4>
          <p className="topology-bandpower-subtitle">
            {activeChannel && measurement
              ? `Window ${measurement.window_index + 1}: ${measurement.start_time.toFixed(1)}s-${measurement.end_time.toFixed(1)}s · ${activeChannel.channel}`
              : "Select a prediction window and channel"}
          </p>
        </div>
        <div className="topology-bandpower-header-static">
          <span className="topology-bandpower-header-stage">
            {isSCC ? (
              "Mean coherence · other 18 electrodes"
            ) : (
              <>
                {EEG_MODEL_NOTATION_LABELS.filterBank} <MathFormula tex={EEG_MODEL_NOTATION.bandPowerFeature} />
              </>
            )}
            <ComponentStatusIndicator status={status.status} label={status.label} />
          </span>
          {bandPower ? <strong>{bandPower.sampling_frequency.toFixed(0)} Hz</strong> : null}
        </div>
      </div>

      {hasSCC && onBranchChange && (
        <BranchToggle value={branch} onChange={onBranchChange} label="Spectral measurement branch" />
      )}
      <div className="topology-bandpower-body">
        <div className="topology-bandpower-channel-list" aria-label="Channel selector">
          {availableChannels.map((channel) => (
            <button
              key={channel}
              type="button"
              className={`topology-bandpower-channel${activeChannel?.channel === channel ? " topology-bandpower-channel--active" : ""}`}
              onClick={() => onChannelSelect(channel)}
            >
              {channel}
            </button>
          ))}
        </div>

        <div className="topology-bandpower-plot-shell">
          <div className="topology-bandpower-range-controls" aria-label="Band power reference range">
            <span>{getStatsModeLabel(bandPowerStatsMode, bandPowerStatsCohortLabel, modelClasses)}</span>
            <div className="topology-bandpower-range-actions">
              <div className="topology-bandpower-range-switch">
                <button
                  type="button"
                  className={bandPowerStatsMode === "intra_patient" ? "topology-bandpower-range-mode--active" : ""}
                  onClick={() => onBandPowerStatsModeChange("intra_patient")}
                >
                  Intra
                </button>
                <button
                  type="button"
                  className={bandPowerStatsMode === "inter_patient" ? "topology-bandpower-range-mode--active" : ""}
                  disabled={isInterStatsUnavailable}
                  title={isInterStatsUnavailable ? "Run Compute all to enable inter-patient ranges." : undefined}
                  onClick={() => onBandPowerStatsModeChange("inter_patient")}
                >
                  Inter
                </button>
              </div>
              {classLabels.length ? (
                <div
                  className={`topology-bandpower-cohort-selector${
                    bandPowerStatsMode === "inter_patient" ? "" : " topology-bandpower-cohort-selector--reserved"
                  }`}
                  aria-label="Inter-patient cohort range"
                  aria-hidden={bandPowerStatsMode !== "inter_patient"}
                >
                  {classLabels.map((classLabel) => {
                    const isSelected = classLabel === bandPowerStatsCohortLabel;
                    const colors = getEmbeddingClassColors(classLabel, modelClasses);
                    return (
                      <button
                        key={classLabel}
                        type="button"
                        className={`topology-bandpower-cohort-button${
                          isSelected ? " topology-bandpower-cohort-button--active" : ""
                        }`}
                        style={
                          isSelected
                            ? { backgroundColor: colors.fill, color: colors.stroke, borderColor: colors.stroke }
                            : { borderColor: colors.fill }
                        }
                        title={isSelected ? "Show all-patient range" : `Show ${classLabel} inter-patient range`}
                        onClick={() => onBandPowerStatsCohortLabelChange(isSelected ? null : classLabel)}
                      >
                        {formatCompactClassLabel(classLabel, modelClasses)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
          <div className="topology-bandpower-plot-frame">
            <div className="topology-bandpower-plot" ref={containerRef} />
            {isSCC && statsError ? (
              <div className="spectral-reference-error" role="alert">
                {statsError}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isSCC && (error || isLoading) ? (
        <div className="topology-bandpower-overlay" role={error ? "alert" : "status"}>
          {error ?? "Preparing spectral connectivity…"}
        </div>
      ) : null}
      {!isLoading && !error && !channels.length ? (
        <div className="topology-bandpower-overlay">
          Click a 4s prediction window to inspect {isSCC ? "spectral connectivity" : "band power"}.
        </div>
      ) : null}
    </div>
  );
}

function createBandAxisEncoding() {
  return {
    field: "label",
    type: "ordinal" as const,
    sort: { field: "order", order: "ascending" as const },
    axis: {
      title: null,
      labelColor: "#5d6b78",
      labelFontSize: 12,
      tickColor: "#d7e0e8",
      domainColor: "#d7e0e8",
    },
  };
}

function createPowerAxis(isSCC = false) {
  return {
    title: isSCC ? "Mean coherence" : "Relative power (dB)",
    titleColor: "#5d6b78",
    titleFontSize: 11,
    labelColor: "#5d6b78",
    labelFontSize: 11,
    format: isSCC ? ".2f" : ".0f",
    tickCount: 5,
    gridColor: "#e8eef3",
    domain: false,
  };
}

function createPowerScale(isSCC = false) {
  return {
    domainMin: isSCC ? 0 : MIN_DB_DOMAIN,
    domainMax: isSCC ? 1 : 0,
    nice: false,
    zero: false,
  };
}

function createBandPowerLegendLayer(isSCC: boolean) {
  return {
    data: { values: [] },
    mark: {
      type: "point" as const,
      filled: true,
      opacity: 1,
    },
    encoding: {
      fill: {
        field: LEGEND_SERIES_FIELD,
        type: "nominal" as const,
        scale: {
          domain: [...LEGEND_SERIES_DOMAIN],
          range: [isSCC ? "#9333a8" : "#0e7490", "transparent", DEFAULT_RANGE_FILL],
        },
        legend: createBandPowerLegend(),
      },
      stroke: {
        field: LEGEND_SERIES_FIELD,
        type: "nominal" as const,
        scale: {
          domain: [...LEGEND_SERIES_DOMAIN],
          range: [isSCC ? "#6b217b" : "#064e56", DEFAULT_RANGE_STROKE, DEFAULT_RANGE_FILL],
        },
      },
      shape: {
        field: LEGEND_SERIES_FIELD,
        type: "nominal" as const,
        scale: {
          domain: [...LEGEND_SERIES_DOMAIN],
          range: ["circle", "stroke", "square"],
        },
      },
      strokeDash: {
        field: LEGEND_SERIES_FIELD,
        type: "nominal" as const,
        scale: {
          domain: [...LEGEND_SERIES_DOMAIN],
          range: [
            [1, 0],
            [4, 3],
            [1, 0],
          ],
        },
      },
    },
  };
}

function createBandPowerLegend() {
  return {
    orient: "bottom" as const,
    direction: "horizontal" as const,
    title: null,
    labelColor: "#64748b",
    labelFontSize: 10,
    labelLimit: 180,
    symbolSize: 120,
    symbolStrokeWidth: 3,
  };
}

function getStatsModeLabel(
  mode: ModelBandPowerStatsMode,
  cohortLabel: string | null,
  modelClasses: ModelClassPresentation[],
): string {
  if (mode === "intra_patient") {
    return "2sigma range: patient windows";
  }

  return cohortLabel
    ? `2sigma range: ${formatCompactClassLabel(cohortLabel, modelClasses)} patient means`
    : "2sigma range: patient means";
}

function getRangeColors(
  cohortLabel: string | null,
  modelClasses: ModelClassPresentation[],
): { fill: string; stroke: string } {
  if (!cohortLabel) {
    return { fill: DEFAULT_RANGE_FILL, stroke: DEFAULT_RANGE_STROKE };
  }

  return getEmbeddingClassColors(cohortLabel, modelClasses);
}

function toRelativePowerDb(relativePower: number): number {
  return 10 * Math.log10(Math.max(relativePower, MIN_RELATIVE_POWER_FOR_DB));
}

function createBandPowerActionDescriptors({
  channelRef,
  windowRef,
  channels,
  predictionWindowCount,
}: {
  channelRef: VacpRef;
  windowRef: VacpRef;
  channels: ChannelId[];
  predictionWindowCount: number;
}): VacpActionDescriptor[] {
  return [
    createBandPowerActionDescriptor(
      TOTAL_BAND_POWER_ACTIONS.channelNext,
      channelRef,
      "Select the next EEG channel in the spectral measurement chart.",
    ),
    createBandPowerActionDescriptor(
      TOTAL_BAND_POWER_ACTIONS.channelPrevious,
      channelRef,
      "Select the previous EEG channel in the spectral measurement chart.",
    ),
    createBandPowerActionDescriptor(
      TOTAL_BAND_POWER_ACTIONS.channelSet,
      channelRef,
      "Select a specific EEG channel in the spectral measurement chart.",
      { channel: { type: "string", enum: channels } },
    ),
    createBandPowerActionDescriptor(
      TOTAL_BAND_POWER_ACTIONS.windowNext,
      windowRef,
      "Select the next prediction window in the spectral measurement chart.",
    ),
    createBandPowerActionDescriptor(
      TOTAL_BAND_POWER_ACTIONS.windowPrevious,
      windowRef,
      "Select the previous prediction window in the spectral measurement chart.",
    ),
    createBandPowerActionDescriptor(
      TOTAL_BAND_POWER_ACTIONS.windowSet,
      windowRef,
      "Select a specific prediction window in the spectral measurement chart.",
      { windowIndex: { type: "integer", minimum: 0, maximum: Math.max(0, predictionWindowCount - 1) } },
    ),
  ];
}

function createBandPowerActionDescriptor(
  name: string,
  targetRef: VacpRef,
  description: string,
  properties: Record<string, unknown> = {},
): VacpActionDescriptor {
  return {
    name,
    targetRef,
    title: name.replace(/^patient_view\.total_band_power\./, "").replace(/_/g, " "),
    description,
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", const: targetRef },
        ...properties,
      },
      required: Object.keys(properties),
    },
  };
}

function executeBandPowerAction(call: VacpActionCall, state: BandPowerInteractionState): VacpActionResult {
  if (call.name === TOTAL_BAND_POWER_ACTIONS.channelNext) {
    return selectBandPowerChannel(call.callId, state, 1);
  }

  if (call.name === TOTAL_BAND_POWER_ACTIONS.channelPrevious) {
    return selectBandPowerChannel(call.callId, state, -1);
  }

  if (call.name === TOTAL_BAND_POWER_ACTIONS.channelSet) {
    const channel = getChannelParam(call.params);
    if (!channel || !state.availableChannels.includes(channel)) {
      return { callId: call.callId, ok: true, result: { channel, found: false } };
    }

    state.onChannelSelect(channel);
    return { callId: call.callId, ok: true, result: { channel, found: true } };
  }

  if (call.name === TOTAL_BAND_POWER_ACTIONS.windowNext) {
    return selectBandPowerWindow(call.callId, state, 1);
  }

  if (call.name === TOTAL_BAND_POWER_ACTIONS.windowPrevious) {
    return selectBandPowerWindow(call.callId, state, -1);
  }

  if (call.name === TOTAL_BAND_POWER_ACTIONS.windowSet) {
    const windowIndex = getWindowIndexParam(call.params);
    if (!isValidWindowIndex(windowIndex, state.predictionWindowCount)) {
      return { callId: call.callId, ok: true, result: { windowIndex, found: false } };
    }

    state.onWindowSelect(windowIndex);
    return { callId: call.callId, ok: true, result: { windowIndex, found: true } };
  }

  return { callId: call.callId, ok: false, error: { message: `Unknown total band power action: ${call.name}` } };
}

function selectBandPowerChannel(callId: string, state: BandPowerInteractionState, direction: 1 | -1): VacpActionResult {
  const channel = getRelativeChannel(state, direction);
  if (!channel) {
    return { callId, ok: true, result: { channel: null, found: false } };
  }

  state.onChannelSelect(channel);
  return { callId, ok: true, result: { channel, found: true } };
}

function getRelativeChannel(state: BandPowerInteractionState, direction: 1 | -1): ChannelId | null {
  const channels = state.availableChannels;
  if (!channels.length) return null;
  const currentIndex = state.selectedChannel ? channels.indexOf(state.selectedChannel) : -1;
  const nextIndex = (currentIndex + direction + channels.length) % channels.length;
  return channels[nextIndex] ?? null;
}

function selectBandPowerWindow(callId: string, state: BandPowerInteractionState, direction: 1 | -1): VacpActionResult {
  const windowIndex = getRelativeWindowIndex(state, direction);
  if (windowIndex === null) {
    return { callId, ok: true, result: { windowIndex: null, found: false } };
  }

  state.onWindowSelect(windowIndex);
  return { callId, ok: true, result: { windowIndex, found: true } };
}

function getRelativeWindowIndex(state: BandPowerInteractionState, direction: 1 | -1): number | null {
  if (state.predictionWindowCount <= 0) return null;
  const currentIndex = state.selectedWindowIndex ?? -1;
  return Math.max(0, Math.min(state.predictionWindowCount - 1, currentIndex + direction));
}

function isValidWindowIndex(windowIndex: number | null, predictionWindowCount: number): windowIndex is number {
  return windowIndex !== null && windowIndex >= 0 && windowIndex < predictionWindowCount;
}

function getChannelParam(params: unknown): ChannelId | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const channel = (params as { channel?: unknown }).channel;
  return typeof channel === "string" && channel.length ? channel : null;
}

function getWindowIndexParam(params: unknown): number | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const windowIndex = (params as { windowIndex?: unknown }).windowIndex;
  return typeof windowIndex === "number" && Number.isInteger(windowIndex) ? windowIndex : null;
}

function getBandPowerStatus({
  bandPower,
  error,
  isLoading,
  isLoadingStats,
  statsError,
}: Pick<TotalBandPowerChartProps, "error" | "isLoading" | "isLoadingStats" | "statsError"> & {
  bandPower: ModelBandPowerResponse | SCCResponse | null;
}): {
  status: "idle" | "loading" | "loaded" | "error";
  label: string;
} {
  if (error || statsError) {
    return { status: "error", label: error ?? statsError ?? "Unable to load measurements." };
  }

  if (isLoading || isLoadingStats) {
    return { status: "loading", label: isLoading ? "Loading measurements" : "Loading reference range" };
  }

  if (bandPower) {
    return { status: "loaded", label: "Measurements loaded" };
  }

  return { status: "idle", label: "Measurements idle" };
}
