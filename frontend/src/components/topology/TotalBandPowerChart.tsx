import { useEffect, useMemo, useRef, useState } from "react";
import { changeset } from "vega";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { MODEL_BAND_LABELS } from "../../constants/eegModel";
import type { ChannelId, ModelBandPowerResponse, ModelBandPowerStatsMode, ModelBandPowerStatsResponse } from "../../types";
import { ComponentStatusIndicator, MathFormula } from "../ui";

interface TotalBandPowerChartProps {
  bandPower: ModelBandPowerResponse | null;
  bandPowerStats: ModelBandPowerStatsResponse | null;
  bandPowerStatsMode: ModelBandPowerStatsMode;
  isInterStatsUnavailable: boolean;
  isLoading: boolean;
  isLoadingStats: boolean;
  error: string | null;
  statsError: string | null;
  selectedChannels: ChannelId[];
  onChannelSelect: (channel: ChannelId) => void;
  onBandPowerStatsModeChange: (mode: ModelBandPowerStatsMode) => void;
}

const MIN_RELATIVE_POWER_FOR_DB = 1e-6;
const MIN_DB_DOMAIN = -40;
const BAND_POWER_DATA_NAME = "bandPowerValues";

export function TotalBandPowerChart({
  bandPower,
  bandPowerStats,
  bandPowerStatsMode,
  isInterStatsUnavailable,
  isLoading,
  isLoadingStats,
  error,
  statsError,
  selectedChannels,
  onChannelSelect,
  onBandPowerStatsModeChange,
}: TotalBandPowerChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const [plotHeight, setPlotHeight] = useState(240);

  const channels = bandPower?.channels ?? [];
  const availableChannels = useMemo(() => channels.map((channel) => channel.channel), [channels]);
  const selectedChannel =
    selectedChannels.find((channel) => availableChannels.includes(channel)) ?? availableChannels[0] ?? null;

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.channel === selectedChannel) ?? channels[0] ?? null,
    [channels, selectedChannel],
  );
  const activeStatsChannel = useMemo(
    () =>
      bandPowerStats?.channels.find((channel) => channel.channel === selectedChannel) ??
      bandPowerStats?.channels[0] ??
      null,
    [bandPowerStats, selectedChannel],
  );
  const statsByBand = useMemo(
    () => new Map((activeStatsChannel?.bands ?? []).map((band) => [band.band, band])),
    [activeStatsChannel],
  );

  const values = useMemo(
    () =>
      (activeChannel?.bands ?? []).map((band, index) => {
        const stats = statsByBand.get(band.band);
        return {
          order: index,
          band: band.band,
          label: MODEL_BAND_LABELS[band.band] ?? band.band,
          relativePower: band.relative_power,
          relativePowerDb: toRelativePowerDb(band.relative_power),
          lower2SigmaDb: stats?.lower_2sigma_db ?? null,
          upper2SigmaDb: stats?.upper_2sigma_db ?? null,
          meanDb: stats?.mean_db ?? null,
          statsSampleCount: stats?.sample_count ?? null,
          percent: band.relative_power * 100,
          range: `${band.start_hz.toFixed(1)}-${band.end_hz.toFixed(1)} Hz`,
        };
      }),
    [activeChannel, statsByBand],
  );
  const valuesRef = useRef<typeof values>([]);
  const hasStats = values.some((value) => value.lower2SigmaDb !== null && value.upper2SigmaDb !== null);
  const status = getBandPowerStatus({ bandPower, error, isLoading, isLoadingStats, statsError });

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextHeight = Math.max(180, Math.floor(entry.contentRect.height));
      setPlotHeight((current) => (current !== nextHeight ? nextHeight : current));
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
        ...(hasStats
          ? [
              {
                mark: {
                  type: "area",
                  interpolate: "monotone",
                  color: "#0e7490",
                  opacity: 0.13,
                },
                encoding: {
                  x: createBandAxisEncoding(),
                  y: {
                    field: "lower2SigmaDb",
                    type: "quantitative",
                    axis: createPowerAxis(),
                    scale: createPowerScale(),
                  },
                  y2: { field: "upper2SigmaDb" },
                },
              },
              {
                mark: {
                  type: "line",
                  interpolate: "monotone",
                  color: "#64748b",
                  strokeDash: [4, 3],
                  strokeWidth: 1.5,
                },
                encoding: {
                  x: createBandAxisEncoding(),
                  y: {
                    field: "meanDb",
                    type: "quantitative",
                    axis: createPowerAxis(),
                    scale: createPowerScale(),
                  },
                },
              },
            ]
          : []),
        {
          mark: {
            type: "line",
            interpolate: "monotone",
            point: {
              filled: true,
              fill: "#0e7490",
              stroke: "#064e56",
              size: 74,
              strokeWidth: 2,
            },
            color: "#0e7490",
            strokeWidth: 2.5,
          },
          encoding: {
            x: createBandAxisEncoding(),
            y: {
              field: "relativePowerDb",
              type: "quantitative",
              axis: createPowerAxis(),
              scale: createPowerScale(),
            },
            tooltip: [
              { field: "band", type: "nominal", title: "Band" },
              { field: "range", type: "nominal", title: "Range" },
              { field: "percent", type: "quantitative", title: "Relative power (%)", format: ".2f" },
              { field: "relativePowerDb", type: "quantitative", title: "Selected window (dB)", format: ".1f" },
              { field: "meanDb", type: "quantitative", title: "Reference mean (dB)", format: ".1f" },
              { field: "lower2SigmaDb", type: "quantitative", title: "-2sigma (dB)", format: ".1f" },
              { field: "upper2SigmaDb", type: "quantitative", title: "+2sigma (dB)", format: ".1f" },
              { field: "statsSampleCount", type: "quantitative", title: "Reference samples", format: ".0f" },
            ],
          },
        },
      ],
      config: {
        view: { stroke: null },
      },
    };

    let finalized = false;
    const resultPromise = embed(container, spec, {
      actions: false,
      renderer: "svg",
    });

    resultPromise.catch(() => undefined);
    resultPromise
      .then((result) => {
        if (!finalized) {
          viewRef.current = result.view;
          result.view
            .change(BAND_POWER_DATA_NAME, changeset().remove(() => true).insert(valuesRef.current))
            .runAsync()
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      viewRef.current = null;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [error, hasStats, plotHeight, values.length]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !values.length) {
      return;
    }

    view
      .change(BAND_POWER_DATA_NAME, changeset().remove(() => true).insert(values))
      .runAsync()
      .catch(() => undefined);
  }, [values]);

  return (
    <div className="topology-bandpower">
      <div className="topology-bandpower-header">
        <div>
          <h4 className="topology-bandpower-title">Total band power</h4>
          <p className="topology-bandpower-subtitle">
            {activeChannel && bandPower
              ? `Window ${bandPower.window_index + 1}: ${bandPower.start_time.toFixed(1)}s-${bandPower.end_time.toFixed(1)}s · ${activeChannel.channel}`
              : "Select a prediction window and channel"}
          </p>
        </div>
        <div className="topology-bandpower-header-static">
          <span className="topology-bandpower-header-stage">
            Filter bank: band-power features from <MathFormula tex={"W_{c,f}(t)"} />
            <ComponentStatusIndicator status={status.status} label={status.label} />
          </span>
          {bandPower ? <strong>{bandPower.sampling_frequency.toFixed(0)} Hz</strong> : null}
        </div>
      </div>

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
            <span>{getStatsModeLabel(bandPowerStatsMode)}</span>
            <div>
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
          </div>
          <div className="topology-bandpower-plot" ref={containerRef} />
        </div>
      </div>

      {!isLoading && !error && !channels.length ? (
        <div className="topology-bandpower-overlay">Click a 4s prediction window to inspect band power.</div>
      ) : null}
    </div>
  );
}

function createBandAxisEncoding() {
  return {
    field: "label",
    type: "ordinal",
    sort: { field: "order", order: "ascending" },
    axis: {
      title: null,
      labelColor: "#5d6b78",
      labelFontSize: 12,
      tickColor: "#d7e0e8",
      domainColor: "#d7e0e8",
    },
  };
}

function createPowerAxis() {
  return {
    title: "Relative power (dB)",
    titleColor: "#5d6b78",
    titleFontSize: 11,
    labelColor: "#5d6b78",
    labelFontSize: 11,
    format: ".0f",
    tickCount: 5,
    gridColor: "#e8eef3",
    domain: false,
  };
}

function createPowerScale() {
  return {
    domainMin: MIN_DB_DOMAIN,
    nice: false,
    zero: false,
  };
}

function getStatsModeLabel(mode: ModelBandPowerStatsMode): string {
  return mode === "intra_patient" ? "2sigma range: patient windows" : "2sigma range: patient means";
}

function toRelativePowerDb(relativePower: number): number {
  return 10 * Math.log10(Math.max(relativePower, MIN_RELATIVE_POWER_FOR_DB));
}

function getBandPowerStatus({
  bandPower,
  error,
  isLoading,
  isLoadingStats,
  statsError,
}: Pick<
  TotalBandPowerChartProps,
  "bandPower" | "error" | "isLoading" | "isLoadingStats" | "statsError"
>): { status: "idle" | "loading" | "loaded" | "error"; label: string } {
  if (error || statsError) {
    return { status: "error", label: error ?? statsError ?? "Unable to load band power." };
  }

  if (isLoading || isLoadingStats) {
    return { status: "loading", label: isLoading ? "Loading band power" : "Loading reference range" };
  }

  if (bandPower) {
    return { status: "loaded", label: "Band power loaded" };
  }

  return { status: "idle", label: "Band power idle" };
}

export type { TotalBandPowerChartProps };
