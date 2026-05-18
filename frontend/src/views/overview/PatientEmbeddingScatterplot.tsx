import { useEffect, useMemo, useRef, useState } from "react";

import { EmbeddingScatterplot } from "../../components";
import type { EmbeddingScatterplotPoint, EmbeddingScatterplotTooltipField } from "../../components";
import { getAnnotationClassColor, getEmbeddingClassColors, getModelClassLabels } from "../../constants/eegModel";
import type { ModelInfoResponse, ModelPatientEmbeddingsResponse } from "../../types";

type LegendHighlightTarget = { kind: "true" | "predicted"; label: string } | { kind: "misclassified" };

interface PatientEmbeddingScatterplotProps {
  embeddings: ModelPatientEmbeddingsResponse | null;
  isLoading: boolean;
  error: string | null;
  highlightedSubjectId: string | null;
  modelInfo: ModelInfoResponse | null;
  selectedSubjectIds: string[] | null;
  selectionResetKey: number;
  onOpenSubject: (subjectId: string) => void;
  onSelectedSubjectIdsChange: (subjectIds: string[] | null) => void;
}

type PatientEmbeddingDatum = EmbeddingScatterplotPoint & {
  subjectId: string;
  trueLabel: string;
  predictedLabel: string;
  meanConfidence: number | null;
  meanConfidencePercent: number | null;
  totalWindows: number;
};

const PATIENT_EMBEDDING_TOOLTIP_FIELDS: EmbeddingScatterplotTooltipField[] = [
  { field: "subjectId", type: "nominal", title: "Patient" },
  { field: "trueLabel", type: "nominal", title: "True label" },
  { field: "predictedLabel", type: "nominal", title: "Predicted label" },
  { field: "meanConfidencePercent", type: "quantitative", title: "Confidence (%)", format: ".1f" },
  { field: "totalWindows", type: "quantitative", title: "Windows" },
];

export function PatientEmbeddingScatterplot({
  embeddings,
  isLoading,
  error,
  highlightedSubjectId,
  modelInfo,
  selectedSubjectIds,
  selectionResetKey,
  onOpenSubject,
  onSelectedSubjectIdsChange,
}: PatientEmbeddingScatterplotProps) {
  const lastSelectionResetKeyRef = useRef(selectionResetKey);
  const [legendHighlightTarget, setLegendHighlightTarget] = useState<LegendHighlightTarget | null>(null);
  const [isMisclassifiedHighlightActive, setIsMisclassifiedHighlightActive] = useState(false);
  const [brushSelectedSubjectIds, setBrushSelectedSubjectIds] = useState<string[] | null>(null);
  const modelClasses = modelInfo?.classes ?? [];
  const modelClassLabels = useMemo(() => getModelClassLabels(modelClasses), [modelClasses]);

  const values = useMemo<PatientEmbeddingDatum[]>(
    () =>
      (embeddings?.points ?? []).map((point) => {
        const trueLabel = point.true_label ?? "Unknown";
        const predictedLabel = point.predicted_label ?? "Unknown";
        const isMisclassified = trueLabel !== predictedLabel;
        const predictedColors = getEmbeddingClassColors(point.predicted_label, modelClasses);
        const isSubjectHighlighted = point.subject_id === highlightedSubjectId;
        const isClassLegendHighlighted =
          legendHighlightTarget?.kind === "true"
            ? trueLabel === legendHighlightTarget.label
            : legendHighlightTarget?.kind === "predicted"
              ? predictedLabel === legendHighlightTarget.label
              : false;
        const isLegendHighlighted =
          isClassLegendHighlighted || (legendHighlightTarget?.kind === "misclassified" && isMisclassified);
        const hasActiveHighlight = Boolean(highlightedSubjectId || legendHighlightTarget);
        const isHighlighted = isSubjectHighlighted || isLegendHighlighted;
        const isMuted = hasActiveHighlight && !isHighlighted;

        return {
          id: point.subject_id,
          subjectId: point.subject_id,
          x: point.x,
          y: point.y,
          trueLabel,
          predictedLabel,
          fillColor: getAnnotationClassColor(point.true_label, modelClasses),
          strokeColor: predictedColors.stroke,
          pointSize: isSubjectHighlighted ? 210 : 88,
          opacity: isMuted ? 0.18 : isHighlighted ? 1 : 0.72,
          strokeWidth: isSubjectHighlighted ? 3.5 : isMisclassified ? 2.2 : 1.4,
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
  const misclassifiedCount = useMemo(
    () => values.filter((value) => value.trueLabel !== value.predictedLabel).length,
    [values],
  );
  const misclassifiedSubjectIds = useMemo(
    () => values.filter((value) => value.trueLabel !== value.predictedLabel).map((value) => value.subjectId),
    [values],
  );
  const effectiveSelectedSubjectIds = useMemo(() => {
    if (isMisclassifiedHighlightActive && brushSelectedSubjectIds) {
      const misclassifiedSubjectIdSet = new Set(misclassifiedSubjectIds);
      return brushSelectedSubjectIds.filter((subjectId) => misclassifiedSubjectIdSet.has(subjectId));
    }

    if (isMisclassifiedHighlightActive) {
      return misclassifiedSubjectIds;
    }

    return brushSelectedSubjectIds;
  }, [brushSelectedSubjectIds, isMisclassifiedHighlightActive, misclassifiedSubjectIds]);

  useEffect(() => {
    if (lastSelectionResetKeyRef.current !== selectionResetKey) {
      return;
    }

    if (!areSubjectSelectionsEqual(selectedSubjectIds, effectiveSelectedSubjectIds)) {
      onSelectedSubjectIdsChange(effectiveSelectedSubjectIds);
    }
  }, [effectiveSelectedSubjectIds, onSelectedSubjectIdsChange, selectedSubjectIds, selectionResetKey]);

  useEffect(() => {
    setBrushSelectedSubjectIds(null);
    setIsMisclassifiedHighlightActive(false);
    setLegendHighlightTarget(null);
  }, [embeddings?.dataset_id, embeddings?.checkpoint_key]);

  useEffect(() => {
    lastSelectionResetKeyRef.current = selectionResetKey;
    setBrushSelectedSubjectIds(null);
    setIsMisclassifiedHighlightActive(false);
    setLegendHighlightTarget(null);
  }, [selectionResetKey]);

  const emptyMessage = !modelInfo
    ? "Model metadata unavailable."
    : embeddings?.reduction.status === "insufficient_data"
      ? "Need at least two cached patient embeddings."
      : "Compute prediction cache to populate patient embeddings.";
  const highlightLegendLabel = (kind: LegendHighlightTarget["kind"], label: string) => {
    if (kind === "misclassified") {
      setLegendHighlightTarget({ kind });
      return;
    }

    setLegendHighlightTarget({ kind, label });
  };
  const highlightMisclassified = () => setLegendHighlightTarget({ kind: "misclassified" });
  const clearLegendHighlight = () =>
    setLegendHighlightTarget(isMisclassifiedHighlightActive ? { kind: "misclassified" } : null);
  const toggleMisclassifiedHighlight = () => {
    setIsMisclassifiedHighlightActive((current) => {
      const next = !current;
      setLegendHighlightTarget(next ? { kind: "misclassified" } : null);
      return next;
    });
  };
  const clearSelectedSubjects = () => {
    setBrushSelectedSubjectIds(null);
    setIsMisclassifiedHighlightActive(false);
    setLegendHighlightTarget(null);
  };
  const selectBrushSubjects = (subjectIds: string[] | null) => {
    setBrushSelectedSubjectIds(subjectIds);
  };

  return (
    <section className="overview-placeholder-card overview-placeholder-card--wide overview-embedding-card">
      <div className="overview-embedding-header">
        <div>
          <p className="overview-kicker">Patient embedding</p>
          <h3>{embeddings?.embedding_label ?? (modelInfo ? "Patient embedding" : "Model unavailable")}</h3>
        </div>
        {embeddings ? (
          <div className="overview-embedding-meta-group">
            {selectedSubjectIds ? (
              <button type="button" className="overview-embedding-selection-clear" onClick={clearSelectedSubjects}>
                {selectedSubjectIds.length} selected
              </button>
            ) : null}
            <span className="overview-embedding-meta">
              {embeddings.points.length} patients / {embeddings.reduction.source_dimension}D
            </span>
          </div>
        ) : null}
      </div>

      <div className="overview-embedding-plot-shell">
        <EmbeddingScatterplot
          key={selectionResetKey}
          points={values}
          isLoading={isLoading}
          error={error}
          emptyMessage={emptyMessage}
          tooltipFields={PATIENT_EMBEDDING_TOOLTIP_FIELDS}
          className="overview-embedding-plot"
          overlayClassName="overview-embedding-overlay"
          onPointClick={(point) => {
            if (typeof point.subjectId === "string") {
              onOpenSubject(point.subjectId);
            }
          }}
          onSelectionChange={selectBrushSubjects}
        />
      </div>

      {legendClassLabels.length ? (
        <div className="overview-embedding-legend" aria-label="Embedding color legend">
          <div className="overview-embedding-legend-main">
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
                    style={{ backgroundColor: getAnnotationClassColor(label, modelClasses) }}
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
          {misclassifiedCount ? (
            <div className="overview-embedding-legend-flag">
              <span>Flag</span>
              <button
                type="button"
                className={`overview-embedding-legend-item overview-embedding-legend-item--option${
                  isMisclassifiedHighlightActive ? " overview-embedding-legend-item--active" : ""
                }`}
                aria-pressed={isMisclassifiedHighlightActive}
                onBlur={clearLegendHighlight}
                onClick={toggleMisclassifiedHighlight}
                onFocus={highlightMisclassified}
                onMouseEnter={highlightMisclassified}
                onMouseLeave={clearLegendHighlight}
              >
                <i className="overview-embedding-legend-misclassified" />
                Misclassified ({misclassifiedCount})
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function areSubjectSelectionsEqual(first: string[] | null, second: string[] | null): boolean {
  if (first === second) {
    return true;
  }

  if (!first || !second || first.length !== second.length) {
    return false;
  }

  return first.every((subjectId, index) => subjectId === second[index]);
}
