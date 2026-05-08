import { useEffect, useMemo, useRef, useState } from "react";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { getEmbeddingClassColors, getModelClassLabels } from "../../constants/eegModel";
import type { ModelInfoResponse, ModelPatientEmbeddingsResponse } from "../../types";

type LegendHighlightTarget = { kind: "true" | "predicted"; label: string };

interface PatientEmbeddingScatterplotProps {
  embeddings: ModelPatientEmbeddingsResponse | null;
  isLoading: boolean;
  error: string | null;
  highlightedSubjectId: string | null;
  modelInfo: ModelInfoResponse | null;
  onOpenSubject: (subjectId: string) => void;
}

interface PatientEmbeddingDatum {
  subjectId: string;
  x: number;
  y: number;
  trueLabel: string;
  predictedLabel: string;
  trueColor: string;
  predictedColor: string;
  pointSize: number;
  opacity: number;
  strokeWidth: number;
  meanConfidence: number | null;
  meanConfidencePercent: number | null;
  totalWindows: number;
}

export function PatientEmbeddingScatterplot({
  embeddings,
  isLoading,
  error,
  highlightedSubjectId,
  modelInfo,
  onOpenSubject,
}: PatientEmbeddingScatterplotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [plotHeight, setPlotHeight] = useState(280);
  const [legendHighlightTarget, setLegendHighlightTarget] = useState<LegendHighlightTarget | null>(null);
  const modelClasses = modelInfo?.classes ?? [];
  const modelClassLabels = useMemo(() => getModelClassLabels(modelClasses), [modelClasses]);

  const values = useMemo<PatientEmbeddingDatum[]>(
    () =>
      (embeddings?.points ?? []).map((point) => {
        const trueColors = getEmbeddingClassColors(point.true_label, modelClasses);
        const predictedColors = getEmbeddingClassColors(point.predicted_label, modelClasses);
        const isSubjectHighlighted = point.subject_id === highlightedSubjectId;
        const isLegendHighlighted =
          legendHighlightTarget?.kind === "true"
            ? point.true_label === legendHighlightTarget.label
            : legendHighlightTarget?.kind === "predicted"
              ? point.predicted_label === legendHighlightTarget.label
              : false;
        const hasActiveHighlight = Boolean(highlightedSubjectId || legendHighlightTarget);
        const isHighlighted = isSubjectHighlighted || isLegendHighlighted;
        const isMuted = hasActiveHighlight && !isHighlighted;

        return {
          subjectId: point.subject_id,
          x: point.x,
          y: point.y,
          trueLabel: point.true_label ?? "Unknown",
          predictedLabel: point.predicted_label ?? "Unknown",
          trueColor: trueColors.fill,
          predictedColor: predictedColors.stroke,
          pointSize: isSubjectHighlighted ? 210 : isLegendHighlighted ? 132 : 88,
          opacity: isMuted ? 0.18 : isHighlighted ? 1 : 0.72,
          strokeWidth: isSubjectHighlighted
            ? 3.5
            : isLegendHighlighted
              ? 2.8
              : point.true_label !== point.predicted_label
                ? 2.2
                : 1.4,
          meanConfidence: point.mean_confidence ?? null,
          meanConfidencePercent: point.mean_confidence == null ? null : point.mean_confidence * 100,
          totalWindows: point.total_windows,
        };
      }),
    [embeddings, highlightedSubjectId, legendHighlightTarget, modelClasses],
  );
  const legendClassLabels = useMemo(
    () =>
      modelClassLabels.filter((label) =>
        values.some((value) => value.trueLabel === label || value.predictedLabel === label),
      ),
    [modelClassLabels, values],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextHeight = Math.max(220, Math.floor(entry.contentRect.height));
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
    if (!values.length || isLoading || error || plotHeight <= 0) {
      return;
    }

    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      width: "container",
      height: plotHeight,
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { values },
      mark: {
        type: "circle",
        filled: true,
        cursor: "pointer",
      },
      encoding: {
        x: {
          field: "x",
          type: "quantitative",
          axis: {
            title: "PC1",
            titleColor: "#5d6b78",
            titleFontSize: 11,
            labelColor: "#5d6b78",
            labelFontSize: 11,
            tickColor: "#d7e0e8",
            domainColor: "#d7e0e8",
            gridColor: "#e8eef3",
          },
        },
        y: {
          field: "y",
          type: "quantitative",
          axis: {
            title: "PC2",
            titleColor: "#5d6b78",
            titleFontSize: 11,
            labelColor: "#5d6b78",
            labelFontSize: 11,
            tickColor: "#d7e0e8",
            domainColor: "#d7e0e8",
            gridColor: "#e8eef3",
          },
        },
        fill: { field: "trueColor", type: "nominal", scale: null, legend: null },
        stroke: { field: "predictedColor", type: "nominal", scale: null, legend: null },
        size: { field: "pointSize", type: "quantitative", scale: null, legend: null },
        opacity: { field: "opacity", type: "quantitative", scale: null, legend: null },
        strokeWidth: { field: "strokeWidth", type: "quantitative", scale: null, legend: null },
        tooltip: [
          { field: "subjectId", type: "nominal", title: "Patient" },
          { field: "trueLabel", type: "nominal", title: "True label" },
          { field: "predictedLabel", type: "nominal", title: "Predicted label" },
          { field: "meanConfidencePercent", type: "quantitative", title: "Confidence (%)", format: ".1f" },
          { field: "totalWindows", type: "quantitative", title: "Windows" },
        ],
      },
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
        result.view.addEventListener("click", (_event, item) => {
          const datum = item?.datum as PatientEmbeddingDatum | undefined;
          if (datum?.subjectId) {
            onOpenSubject(datum.subjectId);
          }
        });
      })
      .catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [error, isLoading, onOpenSubject, plotHeight, values]);

  const emptyMessage = !modelInfo
    ? "Model metadata unavailable."
    : embeddings?.reduction.status === "insufficient_data"
      ? "Need at least two cached patient embeddings."
      : "Compute prediction cache to populate patient embeddings.";
  const highlightLegendLabel = (kind: LegendHighlightTarget["kind"], label: string) => {
    setLegendHighlightTarget({ kind, label });
  };
  const clearLegendHighlight = () => setLegendHighlightTarget(null);

  return (
    <section className="overview-placeholder-card overview-placeholder-card--wide overview-embedding-card">
      <div className="overview-embedding-header">
        <div>
          <p className="overview-kicker">Patient embedding</p>
          <h3>{embeddings?.embedding_label ?? (modelInfo ? "Patient embedding" : "Model unavailable")}</h3>
        </div>
        {embeddings ? (
          <span className="overview-embedding-meta">
            {embeddings.points.length} patients / {embeddings.reduction.source_dimension}D
          </span>
        ) : null}
      </div>

      <div className="overview-embedding-plot-shell">
        <div className="overview-embedding-plot" ref={containerRef} />
        {isLoading ? <div className="overview-embedding-overlay">Loading embeddings...</div> : null}
        {error ? <div className="overview-embedding-overlay overview-embedding-overlay--error">{error}</div> : null}
        {!isLoading && !error && !values.length ? (
          <div className="overview-embedding-overlay">{emptyMessage}</div>
        ) : null}
      </div>

      {legendClassLabels.length ? (
        <div className="overview-embedding-legend" aria-label="Embedding color legend">
          <div>
            <span>True</span>
            {legendClassLabels.map((label) => (
              <button
                key={`true-${label}`}
                type="button"
                className="overview-embedding-legend-item"
                onBlur={clearLegendHighlight}
                onFocus={() => highlightLegendLabel("true", label)}
                onMouseEnter={() => highlightLegendLabel("true", label)}
                onMouseLeave={clearLegendHighlight}
              >
                <i
                  className="overview-embedding-legend-fill"
                  style={{ backgroundColor: getEmbeddingClassColors(label, modelClasses).fill }}
                />
                {label}
              </button>
            ))}
          </div>
          <div>
            <span>Pred</span>
            {legendClassLabels.map((label) => (
              <button
                key={`predicted-${label}`}
                type="button"
                className="overview-embedding-legend-item"
                onBlur={clearLegendHighlight}
                onFocus={() => highlightLegendLabel("predicted", label)}
                onMouseEnter={() => highlightLegendLabel("predicted", label)}
                onMouseLeave={clearLegendHighlight}
              >
                <i
                  className="overview-embedding-legend-stroke"
                  style={{ borderColor: getEmbeddingClassColors(label, modelClasses).stroke }}
                />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
