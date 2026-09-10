import { BranchToggle } from "../ui/BranchToggle";
import { useFeatureMode } from "../../vacp/useFeatureMode";
import { useEffect, useMemo, useRef, useState } from "react";
import { changeset } from "vega";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { formatCompactClassLabel, getEmbeddingClassColors, getModelBandLabel } from "../../constants/eegModel";
import { EEG_MODEL_NOTATION, EEG_MODEL_NOTATION_LABELS } from "../../constants/eegModelNotation";
import type {
  ModelClassEvidenceContribution,
  ModelClassEvidenceResponse,
  ModelInfoResponse,
  TimeseriesSource,
} from "../../types";
import { resizeVegaView, useVegaLayoutResize } from "../../utils/vegaLayout";
import { ComponentStatusIndicator, MathFormula } from "../ui";
import { useModelClassEvidence } from "./useModelClassEvidence";

interface BandActivationChartProps {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  modelInfo: ModelInfoResponse | null;
  windowIndex: number | null;
}

interface BandActivationDatum {
  order: number;
  band: string;
  label: string;
  activation: number;
  rawActivation: number;
  multiplier: number | null;
  classLabel: string;
  activationText: string;
}

const ACTIVATION_DATA_NAME = "bandActivationValues";

export function BandActivationChart({
  datasetId,
  subjectId,
  source,
  modelInfo,
  windowIndex,
}: BandActivationChartProps) {
  const [branch, setBranch] = useFeatureMode(
    "patient-view/activation-overlay",
    modelInfo?.model_kind === "xeegnet_scc",
    "bp",
    ["bp", "scc"] as const,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const [plotHeight, setPlotHeight] = useState(132);
  const [selectedClassLabel, setSelectedClassLabel] = useState<string | null>(null);
  useVegaLayoutResize(viewRef);

  const { evidence, isLoading, error } = useModelClassEvidence({
    datasetId,
    subjectId,
    modelInfo,
    windowIndex,
  });
  const classLabels = useMemo(() => {
    const evidenceClassLabels = evidence?.bands[0]?.class_contributions.map((contribution) => contribution.class_label);
    if (evidenceClassLabels?.length) {
      return evidenceClassLabels;
    }

    return modelInfo?.classes.map((modelClass) => modelClass.label) ?? [];
  }, [evidence, modelInfo]);
  const values = useMemo(
    () =>
      [
        ...(evidence?.bands.map((band) => ({ ...band, branch: "BP" })) ?? []),
        ...(branch === "scc" ? (evidence?.scc?.bands.map((band) => ({ ...band, branch: "SCC" })) ?? []) : []),
      ].map((band, index) => {
        const order = index % 7;
        const contribution = selectedClassLabel
          ? band.class_contributions.find((item) => item.class_label === selectedClassLabel)
          : null;
        const multiplier = getClassMultiplier(band.feature_value, contribution);
        const activation = contribution ? contribution.contribution : band.feature_value;

        return {
          branch: band.branch,
          frequencyRange: `${band.start_hz}–${band.end_hz} Hz`,
          units: selectedClassLabel ? "logit contribution" : band.branch === "SCC" ? "normalized SCC" : "dB",
          order,
          band: band.band,
          label: getModelBandLabel(band.band, modelInfo?.bands),
          activation,
          rawActivation: band.feature_value,
          multiplier,
          classLabel: selectedClassLabel ?? "Raw activation",
          activationText: formatActivation(activation),
        };
      }) ?? [],
    [evidence, modelInfo?.bands, selectedClassLabel, branch],
  );
  const valuesRef = useRef<typeof values>([]);
  const status = getActivationStatus({ error, evidence, isLoading });
  const activationScaleDomain = useMemo(
    () => (selectedClassLabel ? getSharedContributionDomain(evidence) : null),
    [evidence, selectedClassLabel],
  );
  const activationScaleDomainKey = activationScaleDomain?.join(":") ?? "auto";

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (selectedClassLabel && classLabels.length && !classLabels.includes(selectedClassLabel)) {
      setSelectedClassLabel(null);
    }
  }, [classLabels, selectedClassLabel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const nextHeight = Math.max(32, Math.floor(entry.contentRect.height));
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
    if (!values.length || plotHeight <= 0) {
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
      data: { name: ACTIVATION_DATA_NAME, values },
      resolve: { scale: { y: branch === "scc" && !selectedClassLabel ? "independent" : "shared" } },
      layer: ["BP", ...(branch === "scc" ? ["SCC"] : [])].map((series) => ({
        transform: [{ filter: `datum.branch === '${series}'` }],
        mark: {
          type: "line" as const,
          interpolate: "monotone" as const,
          color: series === "BP" ? "#0e7490" : "#9333a8",
          strokeWidth: 2.2,
          ...(series === "SCC" ? { strokeDash: [5, 3] } : {}),
          point: { filled: true, size: 45 },
        },
        encoding: {
          x: createBandAxisEncoding(),
          y: {
            field: "activation",
            type: "quantitative" as const,
            axis: {
              ...createActivationAxis(),
              orient: series === "SCC" && !selectedClassLabel ? ("right" as const) : ("left" as const),
              title: selectedClassLabel ? "Logit contribution" : series === "BP" ? "BP (dB)" : "Normalized SCC",
              titleAngle: 0,
              titleX: 0,
              titleY: -6,
              titleAlign: series === "SCC" && !selectedClassLabel ? ("right" as const) : ("left" as const),
              titleBaseline: "bottom" as const,
              grid: !!selectedClassLabel || series === "BP",
              titleColor: selectedClassLabel ? "#5d6b78" : series === "BP" ? "#0e7490" : "#9333a8",
            },
            scale: createActivationScale(activationScaleDomain),
          },
          tooltip: [
            { field: "branch", type: "nominal" as const, title: "Branch" },
            { field: "band", type: "nominal" as const, title: "Band" },
            { field: "frequencyRange", type: "nominal" as const, title: "Frequency range" },
            { field: "rawActivation", type: "quantitative" as const, title: "Classifier input", format: ".4f" },
            { field: "multiplier", type: "quantitative" as const, title: "Class weight", format: "+.4f" },
            { field: "activation", type: "quantitative" as const, title: "Displayed value", format: "+.4f" },
            { field: "units", type: "nominal" as const, title: "Units" },
          ],
        },
      })),
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
          resizeVegaView(result.view);
          result.view
            .change(
              ACTIVATION_DATA_NAME,
              changeset()
                .remove(() => true)
                .insert(valuesRef.current),
            )
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
  }, [activationScaleDomain, activationScaleDomainKey, plotHeight, values.length, branch, selectedClassLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    if (isLoading && windowIndex !== null && !values.length) {
      return;
    }

    view
      .change(
        ACTIVATION_DATA_NAME,
        changeset()
          .remove(() => true)
          .insert(values),
      )
      .runAsync()
      .catch(() => undefined);
  }, [error, isLoading, values, windowIndex]);

  return (
    <div className="classification-band-activation-chart">
      <div className="classification-band-activation-chart-header">
        <div>
          <h4>Band Activations</h4>
          <p>
            {evidence
              ? `Window ${evidence.window_index + 1}: ${evidence.start_time.toFixed(1)}s-${evidence.end_time.toFixed(1)}s`
              : windowIndex === null
                ? "Select a prediction window"
                : `Window ${windowIndex + 1}`}
          </p>
        </div>
        <span className="classification-band-activation-chart-stage">
          {branch === "scc" ? (
            <span>
              {selectedClassLabel ? "BP + normalized SCC × class weights" : "BP + normalized SCC classifier inputs"}
            </span>
          ) : selectedClassLabel ? (
            <>
              <MathFormula tex={EEG_MODEL_NOTATION.encoderOutput} />{" "}
              {EEG_MODEL_NOTATION_LABELS.bandActivationDenseMultiplier}
            </>
          ) : (
            <>
              {EEG_MODEL_NOTATION_LABELS.encoderOutputPrefix} <MathFormula tex={EEG_MODEL_NOTATION.encoderOutput} />{" "}
              {EEG_MODEL_NOTATION_LABELS.encoderBeforeDenseWeights}
            </>
          )}
          <ComponentStatusIndicator status={status.status} label={status.label} />
        </span>
      </div>

      <div className="classification-band-activation-chart-shell">
        {modelInfo?.model_kind === "xeegnet_scc" && (
          <BranchToggle value={branch} onChange={setBranch} label="SCC activation overlay" bpLabel="–" />
        )}
        {classLabels.length ? (
          <div className="classification-band-activation-class-selector" aria-label="Band activation class multiplier">
            {classLabels.map((classLabel) => {
              const isSelected = classLabel === selectedClassLabel;
              const colors = getEmbeddingClassColors(classLabel, modelInfo?.classes);
              return (
                <button
                  key={classLabel}
                  type="button"
                  className={`classification-band-activation-class-button${
                    isSelected ? " classification-band-activation-class-button--active" : ""
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: colors.fill, color: colors.stroke, borderColor: colors.stroke }
                      : { borderColor: colors.fill }
                  }
                  title={isSelected ? "Clear class multiplier" : `Apply ${classLabel} dense multipliers`}
                  onClick={() => setSelectedClassLabel((current) => (current === classLabel ? null : classLabel))}
                >
                  {formatCompactClassLabel(classLabel, modelInfo?.classes)}
                </button>
              );
            })}
          </div>
        ) : null}
        {branch === "scc" && (
          <div className="feature-branch-legend">
            <span>— BP</span>
            <span>–– SCC</span>
          </div>
        )}
        <div className="classification-band-activation-chart-plot" ref={containerRef} />
        {!values.length || error ? (
          <div
            className={`classification-band-activation-chart-overlay${
              error ? " classification-band-activation-chart-overlay--error" : ""
            }`}
          >
            {error ??
              (isLoading ? "Loading band activations..." : "Click a 4s prediction window to inspect activations.")}
          </div>
        ) : null}
      </div>
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
      labelAngle: 0,
      labelColor: "#5d6b78",
      labelFontSize: 10,
      tickColor: "#d7e0e8",
      domainColor: "#d7e0e8",
    },
  };
}

function createActivationAxis() {
  return {
    title: "Value",
    orient: "right" as const,
    ticks: false,
    labelPadding: 4,
    minExtent: 38,
    maxExtent: 38,
    titleColor: "#5d6b78",
    titleFontSize: 10,
    labelColor: "#5d6b78",
    labelFontSize: 10,
    format: ".2f",
    tickCount: 5,
    gridColor: "#e8eef3",
    domain: false,
  };
}

function createActivationScale(domain: [number, number] | null) {
  if (domain) {
    return { domain };
  }

  return { nice: true, zero: true };
}

function getSharedContributionDomain(evidence: ModelClassEvidenceResponse | null): [number, number] | null {
  const maxAbsContribution = evidence?.global_max_abs_contribution ?? 0;
  if (Number.isFinite(maxAbsContribution) && maxAbsContribution > 0) {
    return [-maxAbsContribution, maxAbsContribution];
  }

  const maxAbsFromBands =
    evidence?.bands.reduce(
      (maxAbs, band) =>
        band.class_contributions.reduce(
          (bandMaxAbs, contribution) => Math.max(bandMaxAbs, Math.abs(contribution.contribution)),
          maxAbs,
        ),
      0,
    ) ?? 0;
  return maxAbsFromBands > 0 ? [-maxAbsFromBands, maxAbsFromBands] : null;
}

function formatActivation(value: number): string {
  if (Math.abs(value) >= 100) {
    return value.toFixed(1);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(2);
  }

  return value.toFixed(3);
}

function getClassMultiplier(
  activation: number,
  contribution: ModelClassEvidenceContribution | null | undefined,
): number | null {
  if (!contribution || activation === 0) {
    return null;
  }

  const multiplier = contribution.contribution / activation;
  return Number.isFinite(multiplier) ? multiplier : null;
}

function getActivationStatus({
  error,
  evidence,
  isLoading,
}: {
  error: string | null;
  evidence: unknown;
  isLoading: boolean;
}): { status: "idle" | "loading" | "loaded" | "error"; label: string } {
  if (error) {
    return { status: "error", label: error };
  }

  if (isLoading) {
    return { status: "loading", label: "Loading band activations" };
  }

  if (evidence) {
    return { status: "loaded", label: "Band activations loaded" };
  }

  return { status: "idle", label: "Band activations idle" };
}

export type { BandActivationChartProps };
