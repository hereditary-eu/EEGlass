import { useEffect, useMemo, useState } from "react";

import { ComponentStatusIndicator, EmbeddingIntrospectionPanel, EmbeddingScatterplot, MathFormula } from "../components";
import type { EmbeddingScatterplotPoint, EmbeddingScatterplotTooltipField } from "../components";
import { getEmbeddingClassColors, getModelClassLabels } from "../constants/eegModel";
import { ModelService } from "../services/ModelService";
import type { ModelInfoResponse, ModelWindowEmbeddingsResponse, TimeseriesSource } from "../types";
import "./WindowEmbeddingPanel.css";

interface WindowEmbeddingPanelProps {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  modelInfo: ModelInfoResponse | null;
  selectedWindowIndex: number | null;
  hoveredWindowIndex: number | null;
  onSelectedWindowIndexChange: (windowIndex: number | null) => void;
  onHoveredWindowIndexChange: (windowIndex: number | null) => void;
}

type WindowEmbeddingDatum = EmbeddingScatterplotPoint & {
  windowIndex: number;
  windowLabel: string;
  timeRange: string;
  predictedLabel: string;
  confidencePercent: number;
};
type WindowEmbeddingLegendTarget = { kind: "predicted"; label: string };

const WINDOW_EMBEDDING_TOOLTIP_FIELDS: EmbeddingScatterplotTooltipField[] = [
  { field: "windowLabel", type: "nominal", title: "Window" },
  { field: "timeRange", type: "nominal", title: "Time" },
  { field: "predictedLabel", type: "nominal", title: "Predicted label" },
  { field: "confidencePercent", type: "quantitative", title: "Confidence (%)", format: ".1f" },
];

export function WindowEmbeddingPanel({
  datasetId,
  subjectId,
  source,
  modelInfo,
  selectedWindowIndex,
  hoveredWindowIndex,
  onSelectedWindowIndexChange,
  onHoveredWindowIndexChange,
}: WindowEmbeddingPanelProps) {
  const [embeddings, setEmbeddings] = useState<ModelWindowEmbeddingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legendHighlightTarget, setLegendHighlightTarget] = useState<WindowEmbeddingLegendTarget | null>(null);
  const modelClasses = modelInfo?.classes ?? [];
  const classLabels = useMemo(() => getModelClassLabels(modelClasses), [modelClasses]);

  useEffect(() => {
    if (!datasetId || !subjectId || !modelInfo?.name) {
      setEmbeddings(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setError(null);

    ModelService.getWindowEmbeddings(datasetId, subjectId, source, modelInfo.name)
      .then((response) => {
        if (isCurrent) {
          setEmbeddings(response);
        }
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setEmbeddings(null);
        setError(getWindowEmbeddingError(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [datasetId, modelInfo?.name, source, subjectId]);

  const values = useMemo<WindowEmbeddingDatum[]>(
    () =>
      (embeddings?.points ?? []).map((point) => {
        const colors = getEmbeddingClassColors(point.predicted_label, modelClasses);
        const isSelected = point.window_index === selectedWindowIndex;
        const isHovered = point.window_index === hoveredWindowIndex;
        const isLegendHighlighted =
          legendHighlightTarget?.kind === "predicted" ? point.predicted_label === legendHighlightTarget.label : false;
        const hasActiveLegendHighlight = Boolean(legendHighlightTarget);
        const keepsSelectionEmphasis = !hasActiveLegendHighlight || isLegendHighlighted;
        const hasPointEmphasis = (isSelected || isHovered) && keepsSelectionEmphasis;

        return {
          id: getWindowPointId(point.window_index),
          windowIndex: point.window_index,
          windowLabel: `Window ${point.window_index + 1}`,
          timeRange: `${point.start_time.toFixed(1)}s-${point.end_time.toFixed(1)}s`,
          x: point.x,
          y: point.y,
          predictedLabel: point.predicted_label,
          confidencePercent: point.confidence * 100,
          fillColor: colors.fill,
          strokeColor: isSelected && keepsSelectionEmphasis ? "#0f172a" : colors.stroke,
          pointSize: isHovered && keepsSelectionEmphasis ? 150 : isSelected && keepsSelectionEmphasis ? 126 : 82,
          opacity: hasActiveLegendHighlight ? (isLegendHighlighted ? 1 : 0.18) : isHovered || isSelected ? 1 : 0.74,
          strokeWidth: isHovered && keepsSelectionEmphasis ? 3 : isSelected && keepsSelectionEmphasis ? 2.6 : 1.35,
        };
      }),
    [embeddings, hoveredWindowIndex, legendHighlightTarget, modelClasses, selectedWindowIndex],
  );
  const introspectionRows = useMemo(
    () =>
      (embeddings?.points ?? []).map((point) => ({
        id: `Window ${point.window_index + 1}`,
        rawEmbedding: point.raw_embedding,
        predictedClass: point.predicted_label,
      })),
    [embeddings],
  );
  const visibleClassLabels = useMemo(
    () => classLabels.filter((label) => values.some((value) => value.predictedLabel === label)),
    [classLabels, values],
  );
  const emptyMessage = !modelInfo
    ? "Model metadata unavailable."
    : embeddings?.reduction.status === "insufficient_data"
      ? "Need at least two prediction windows."
      : "Compute predictions to populate window embeddings.";
  const status = getWindowEmbeddingStatus({ embeddings, error, isLoading });

  return (
    <section className="window-embedding-panel">
      <div className="window-embedding-header">
        <div>
          <h3>Window embedding</h3>
          <p>
            {selectedWindowIndex === null ? "All prediction windows" : `Window ${selectedWindowIndex + 1}`}
            {embeddings ? ` - ${embeddings.points.length} windows / ${embeddings.reduction.source_dimension}D` : ""}
          </p>
        </div>
        <span>
          Encoder output: penultimate representation before <MathFormula tex={"\\Omega"} />
          <ComponentStatusIndicator status={status.status} label={status.label} />
        </span>
      </div>

      <div className="window-embedding-plot-shell">
        <EmbeddingScatterplot
          points={values}
          isLoading={isLoading}
          error={error}
          emptyMessage={emptyMessage}
          tooltipFields={WINDOW_EMBEDDING_TOOLTIP_FIELDS}
          className="window-embedding-plot"
          overlayClassName="window-embedding-overlay"
          minHeight={180}
          showStatusOverlay={false}
          showIntrospectionButton={Boolean(embeddings?.points.length)}
          introspectionTitle="Window embedding introspection"
          introspectionSubtitle={
            embeddings
              ? `${embeddings.points.length} windows / ${embeddings.reduction.source_dimension}D source embedding`
              : undefined
          }
          renderIntrospectionContent={() => (
            <EmbeddingIntrospectionPanel
              rows={introspectionRows}
              sourceDimension={embeddings?.reduction.source_dimension}
              featureNames={embeddings?.feature_names}
              itemLabel="Window"
              tableTitle="Window band activations"
              tableSubtitle="Window rows show per-window encoder activations. Select two activation columns to update the pairwise view."
            />
          )}
          onPointClick={(point) => {
            if (typeof point.windowIndex === "number") {
              onSelectedWindowIndexChange(point.windowIndex);
            }
          }}
        />
      </div>

      {visibleClassLabels.length ? (
        <div className="window-embedding-legend" aria-label="Window embedding legend">
          <div>
            <span>Pred</span>
            {visibleClassLabels.map((label) => (
              <button
                key={label}
                type="button"
                className="window-embedding-legend-item"
                onBlur={() => setLegendHighlightTarget(null)}
                onFocus={() => setLegendHighlightTarget({ kind: "predicted", label })}
                onMouseEnter={() => setLegendHighlightTarget({ kind: "predicted", label })}
                onMouseLeave={() => setLegendHighlightTarget(null)}
              >
                <i style={{ backgroundColor: getEmbeddingClassColors(label, modelClasses).fill }} />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getWindowPointId(windowIndex: number): string {
  return `window:${windowIndex}`;
}

function getWindowEmbeddingError(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to load window embeddings: ${error.message}`;
  }

  return "Unable to load window embeddings.";
}

function getWindowEmbeddingStatus({
  embeddings,
  error,
  isLoading,
}: {
  embeddings: ModelWindowEmbeddingsResponse | null;
  error: string | null;
  isLoading: boolean;
}): { status: "idle" | "loading" | "loaded" | "error"; label: string } {
  if (error) {
    return { status: "error", label: error };
  }

  if (isLoading) {
    return { status: "loading", label: "Loading window embeddings" };
  }

  if (embeddings) {
    return { status: "loaded", label: "Window embeddings loaded" };
  }

  return { status: "idle", label: "Window embeddings idle" };
}
