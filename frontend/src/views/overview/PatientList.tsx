import { useCallback, useEffect } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

import { ClassLabelCountCell, CompactGridSelectorRow, DrillButton } from "../../components/ui";
import { formatCompactClassLabel } from "../../constants/eegModel";
import type { ModelInfoResponse, ModelPredictionSummary, TimeseriesSubjectInfo } from "../../types";
import { registerVacpPatientList } from "../../vacp/registerPatientList";
import {
  formatMeanConfidence,
  getClassDistributionStyle,
  getClassWindowCount,
  getCompactPatientLabel,
  getPatientLabelClass,
  getPatientLabelStyle,
  isPredictionMismatch,
} from "./overviewUtils";

type PatientNavigationKey = "ArrowDown" | "ArrowUp" | "ArrowRight" | "ArrowLeft" | "Home" | "End";

interface PatientListProps {
  subjects: TimeseriesSubjectInfo[];
  selectedDatasetId: string;
  isLoadingSubjects: boolean;
  predictionSummariesBySubject: Map<string, ModelPredictionSummary>;
  hoveredSubjectId: string | null;
  selectedSubjectId: string | null;
  focusSubjectId: string | null;
  modelInfo: ModelInfoResponse | null;
  onOpenPatientView: (subject: TimeseriesSubjectInfo) => void;
  onBackToDatasets: () => void;
  onHoveredSubjectIdChange: (subjectId: string | null) => void;
  onSelectedSubjectIdChange: (subjectId: string | null) => void;
  onFocusSubjectHandled: () => void;
}

export function PatientList({
  subjects,
  selectedDatasetId,
  isLoadingSubjects,
  predictionSummariesBySubject,
  hoveredSubjectId,
  selectedSubjectId,
  focusSubjectId,
  modelInfo,
  onOpenPatientView,
  onBackToDatasets,
  onHoveredSubjectIdChange,
  onSelectedSubjectIdChange,
  onFocusSubjectHandled,
}: PatientListProps) {
  const modelClasses = modelInfo?.classes ?? [];
  const classGridStyle = { "--model-class-count": modelClasses.length } as CSSProperties;

  useEffect(() => {
    if (!focusSubjectId || !subjects.some((subject) => subject.id === focusSubjectId)) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById(getPatientRowId(focusSubjectId))?.focus();
      onFocusSubjectHandled();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [focusSubjectId, onFocusSubjectHandled, subjects]);

  const focusSubjectById = useCallback((subjectId: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(getPatientRowId(subjectId))?.focus();
    });
  }, []);

  const getFocusedSubjectId = useCallback(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) {
      return null;
    }

    return (
      subjects.find((subject) => document.getElementById(getPatientRowId(subject.id)) === activeElement)?.id ?? null
    );
  }, [subjects]);

  const toggleSubjectById = useCallback(
    (subjectId: string) => {
      onSelectedSubjectIdChange(selectedSubjectId === subjectId ? null : subjectId);
    },
    [onSelectedSubjectIdChange, selectedSubjectId],
  );

  const openSubjectById = useCallback(
    (subjectId: string) => {
      const subject = subjects.find((item) => item.id === subjectId);
      if (subject) {
        onOpenPatientView(subject);
      }
    },
    [onOpenPatientView, subjects],
  );

  useEffect(() => {
    return registerVacpPatientList({
      subjects,
      selectedDatasetId,
      isLoadingSubjects,
      predictionSummariesBySubject,
      hoveredSubjectId,
      selectedSubjectId,
      getFocusedSubjectId,
      focusSubject: focusSubjectById,
      toggleSubject: toggleSubjectById,
      openSubject: openSubjectById,
    });
  }, [
    focusSubjectById,
    getFocusedSubjectId,
    hoveredSubjectId,
    isLoadingSubjects,
    openSubjectById,
    predictionSummariesBySubject,
    selectedDatasetId,
    selectedSubjectId,
    subjects,
    toggleSubjectById,
  ]);

  const focusPatientRow = (subjectIndex: number) => {
    const nextSubject = subjects[subjectIndex];
    if (!nextSubject) {
      return;
    }

    focusSubjectById(nextSubject.id);
  };

  const handlePatientNavigationKey = (event: KeyboardEvent<HTMLDivElement>, subjectIndex: number) => {
    if (!isPatientNavigationKey(event.key)) {
      return;
    }

    event.preventDefault();
    if (!subjects.length) {
      return;
    }

    if (event.key === "ArrowRight") {
      onOpenPatientView(subjects[subjectIndex]);
      return;
    }

    if (event.key === "ArrowLeft") {
      onBackToDatasets();
      return;
    }

    if (event.key === "Home") {
      focusPatientRow(0);
      return;
    }

    if (event.key === "End") {
      focusPatientRow(subjects.length - 1);
      return;
    }

    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (subjectIndex + direction + subjects.length) % subjects.length;
    focusPatientRow(nextIndex);
  };

  return (
    <div className="overview-patient-list">
      <div className="overview-patient-list-header" style={classGridStyle} aria-hidden="true">
        <span>id</span>
        <span>split</span>
        {modelClasses.map((modelClass) => (
          <span key={modelClass.label}>{formatCompactClassLabel(modelClass.label, modelClasses)}</span>
        ))}
        <span>true label</span>
        <span>pred</span>
        <span>conf</span>
      </div>
      {subjects.map((subject, subjectIndex) => {
        const summary = predictionSummariesBySubject.get(subject.id) ?? null;
        const cardClasses = [
          "overview-patient-card",
          isPredictionMismatch(summary) ? "overview-patient-card--mismatch" : "",
          hoveredSubjectId === subject.id ? "overview-patient-card--hovered" : "",
          selectedSubjectId === subject.id ? "overview-patient-card--selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const toggleSelectedSubject = () => {
          onSelectedSubjectIdChange(selectedSubjectId === subject.id ? null : subject.id);
        };

        return (
          <div
            key={subject.id}
            className={cardClasses}
            onMouseEnter={() => onHoveredSubjectIdChange(subject.id)}
            onMouseLeave={() => onHoveredSubjectIdChange(null)}
            onFocus={() => onHoveredSubjectIdChange(subject.id)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                onHoveredSubjectIdChange(null);
              }
            }}
          >
            <CompactGridSelectorRow
              id={getPatientRowId(subject.id)}
              className="overview-patient-select"
              role="button"
              tabIndex={0}
              aria-pressed={selectedSubjectId === subject.id}
              style={classGridStyle}
              onClick={toggleSelectedSubject}
              onKeyDown={(event) => {
                handlePatientNavigationKey(event, subjectIndex);
                if (event.defaultPrevented) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleSelectedSubject();
                }
              }}
            >
              <span className="overview-patient-id">{subject.id}</span>
              <span className="overview-patient-split">{formatSubjectSplit(subject.subject_split)}</span>
              {modelClasses.map((modelClass) => (
                <span key={modelClass.label} className="overview-patient-count">
                  {getClassWindowCount(summary, modelClass.label)}
                </span>
              ))}
              <ClassLabelCountCell
                className={getPatientLabelClass()}
                title={summary?.true_label ?? undefined}
                style={getPatientLabelStyle(summary?.true_label, modelClasses)}
                value={getCompactPatientLabel(summary?.true_label, modelClasses)}
              />
              <ClassLabelCountCell
                className={getPatientLabelClass()}
                title={summary?.predicted_label ?? undefined}
                style={getPatientLabelStyle(summary?.predicted_label, modelClasses)}
                value={getCompactPatientLabel(summary?.predicted_label, modelClasses)}
              />
              <span className="overview-patient-confidence">{formatMeanConfidence(summary)}</span>
              {summary && modelClasses.length ? (
                <span
                  className="overview-patient-distribution"
                  style={getClassDistributionStyle(summary, modelClasses)}
                />
              ) : null}
            </CompactGridSelectorRow>
            <DrillButton label={`Open patient view for ${subject.id}`} onClick={() => onOpenPatientView(subject)} />
          </div>
        );
      })}
      {!isLoadingSubjects && selectedDatasetId && subjects.length === 0 ? (
        <div className="overview-empty-state">No patients found for this dataset.</div>
      ) : null}
    </div>
  );
}

function getPatientRowId(subjectId: string): string {
  return `overview-patient-row-${encodeURIComponent(subjectId)}`;
}

function formatSubjectSplit(split: TimeseriesSubjectInfo["subject_split"]): string {
  return split ?? "--";
}

function isPatientNavigationKey(key: string): key is PatientNavigationKey {
  return (
    key === "ArrowDown" ||
    key === "ArrowUp" ||
    key === "ArrowRight" ||
    key === "ArrowLeft" ||
    key === "Home" ||
    key === "End"
  );
}
