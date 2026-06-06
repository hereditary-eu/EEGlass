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
      evidence?.bands.map((band, order) => {
        const contribution = selectedClassLabel
          ? band.class_contributions.find((item) => item.class_label === selectedClassLabel)
          : null;
        const multiplier = getClassMultiplier(band.feature_value, contribution);
        const activation = contribution ? contribution.contribution : band.feature_value;

        return {
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
    [evidence, modelInfo?.bands, selectedClassLabel],
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

      const nextHeight = Math.max(88, Math.floor(entry.contentRect.height));
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
      layer: [
        {
          mark: {
            type: "rule",
            color: "#cbd5e1",
            strokeDash: [4, 3],
          },
          encoding: {
            y: {
              datum: 0,
              type: "quantitative",
              axis: createActivationAxis(),
              scale: createActivationScale(activationScaleDomain),
            },
          },
        },
        {
          mark: {
            type: "line",
            interpolate: "monotone",
            point: {
              filled: true,
              fill: "#0e7490",
              stroke: "#064e56",
              size: 58,
              strokeWidth: 1.8,
            },
            color: "#0e7490",
            strokeWidth: 2.2,
          },
          encoding: {
            x: createBandAxisEncoding(),
            y: {
              field: "activation",
              type: "quantitative",
              axis: createActivationAxis(),
              scale: createActivationScale(activationScaleDomain),
            },
            tooltip: [
              { field: "band", type: "nominal", title: "Band" },
              { field: "classLabel", type: "nominal", title: "View" },
              {
                field: "rawActivation",
                type: "quantitative",
                title: `Activation ${EEG_MODEL_NOTATION.encoderOutput}`,
                format: ".4f",
              },
              { field: "multiplier", type: "quantitative", title: "Class multiplier", format: "+.4f" },
              { field: "activation", type: "quantitative", title: "Displayed value", format: "+.4f" },
              { field: "activationText", type: "nominal", title: "Displayed" },
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
  }, [activationScaleDomain, activationScaleDomainKey, plotHeight, values.length]);

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
          {selectedClassLabel ? (
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
      labelAngle: -90,
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
