import { useEffect } from "react";
import type { KeyboardEvent } from "react";

import { ClassLabelCountCell, CompactGridSelectorRow, DrillButton } from "../../components/ui";
import { MODEL_CLASS_LABELS } from "../../constants/eegModel";
import type { ModelPredictionSummary, TimeseriesSubjectInfo } from "../../types";
import {
  formatMeanConfidence,
  getClassDistributionStyle,
  getClassWindowCount,
  getCompactPatientLabel,
  getPatientLabelClass,
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
  onOpenWorkspace: (subject: TimeseriesSubjectInfo) => void;
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
  onOpenWorkspace,
  onBackToDatasets,
  onHoveredSubjectIdChange,
  onSelectedSubjectIdChange,
  onFocusSubjectHandled,
}: PatientListProps) {
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

  const focusPatientRow = (subjectIndex: number) => {
    const nextSubject = subjects[subjectIndex];
    if (!nextSubject) {
      return;
    }

    document.getElementById(getPatientRowId(nextSubject.id))?.focus();
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
      onOpenWorkspace(subjects[subjectIndex]);
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
      <div className="overview-patient-list-header" aria-hidden="true">
        <span>id</span>
        <span>H</span>
        <span>A</span>
        <span>FTD</span>
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
              <span className="overview-patient-count overview-patient-count--healthy">
                {getClassWindowCount(summary, MODEL_CLASS_LABELS[0])}
              </span>
              <span className="overview-patient-count overview-patient-count--alzheimer">
                {getClassWindowCount(summary, MODEL_CLASS_LABELS[1])}
              </span>
              <span className="overview-patient-count overview-patient-count--ftd">
                {getClassWindowCount(summary, MODEL_CLASS_LABELS[2])}
              </span>
              <ClassLabelCountCell
                className={getPatientLabelClass(summary?.true_label)}
                title={summary?.true_label ?? undefined}
                value={getCompactPatientLabel(summary?.true_label)}
              />
              <ClassLabelCountCell
                className={getPatientLabelClass(summary?.predicted_label)}
                title={summary?.predicted_label ?? undefined}
                value={getCompactPatientLabel(summary?.predicted_label)}
              />
              <span className="overview-patient-confidence">{formatMeanConfidence(summary)}</span>
              {summary ? (
                <span className="overview-patient-distribution" style={getClassDistributionStyle(summary)} />
              ) : null}
            </CompactGridSelectorRow>
            <DrillButton label={`Open workspace for ${subject.id}`} onClick={() => onOpenWorkspace(subject)} />
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

function isPatientNavigationKey(key: string): key is PatientNavigationKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "ArrowRight" || key === "ArrowLeft" || key === "Home" || key === "End";
}
