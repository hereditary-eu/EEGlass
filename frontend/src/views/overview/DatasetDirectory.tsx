import { useEffect } from "react";
import type { KeyboardEvent } from "react";

import { DrillButton } from "../../components/ui";
import type { ModelInfoResponse, ModelPredictionSummary, TimeseriesDatasetInfo, TimeseriesSubjectInfo } from "../../types";
import { PatientList } from "./PatientList";
import type { DirectoryLevel } from "./overviewUtils";
import { getDirectoryStatus } from "./overviewUtils";

type DatasetNavigationKey = "ArrowDown" | "ArrowUp" | "ArrowRight" | "ArrowLeft" | "Home" | "End";

interface DatasetDirectoryProps {
  datasets: TimeseriesDatasetInfo[];
  subjects: TimeseriesSubjectInfo[];
  selectedDatasetId: string;
  directoryLevel: DirectoryLevel;
  isLoadingDatasets: boolean;
  isLoadingSubjects: boolean;
  predictionSummariesBySubject: Map<string, ModelPredictionSummary>;
  hoveredSubjectId: string | null;
  selectedSubjectId: string | null;
  focusSubjectId: string | null;
  focusDatasetId: string | null;
  modelInfo: ModelInfoResponse | null;
  onSelectDataset: (datasetId: string) => void;
  onEnterPatientSelection: (datasetId: string) => void;
  onBackToDatasets: () => void;
  onOpenWorkspace: (subject: TimeseriesSubjectInfo) => void;
  onHoveredSubjectIdChange: (subjectId: string | null) => void;
  onSelectedSubjectIdChange: (subjectId: string | null) => void;
  onFocusSubjectHandled: () => void;
  onFocusDatasetHandled: () => void;
}

export function DatasetDirectory({
  datasets,
  subjects,
  selectedDatasetId,
  directoryLevel,
  isLoadingDatasets,
  isLoadingSubjects,
  predictionSummariesBySubject,
  hoveredSubjectId,
  selectedSubjectId,
  focusSubjectId,
  focusDatasetId,
  modelInfo,
  onSelectDataset,
  onEnterPatientSelection,
  onBackToDatasets,
  onOpenWorkspace,
  onHoveredSubjectIdChange,
  onSelectedSubjectIdChange,
  onFocusSubjectHandled,
  onFocusDatasetHandled,
}: DatasetDirectoryProps) {
  useEffect(() => {
    if (directoryLevel !== "datasets" || !focusDatasetId || !datasets.some((dataset) => dataset.id === focusDatasetId)) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById(getDatasetRowId(focusDatasetId))?.focus();
      onFocusDatasetHandled();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [datasets, directoryLevel, focusDatasetId, onFocusDatasetHandled]);

  const focusDatasetRow = (datasetIndex: number) => {
    const nextDataset = datasets[datasetIndex];
    if (!nextDataset) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(getDatasetRowId(nextDataset.id))?.focus();
    });
  };

  const handleDatasetNavigationKey = (event: KeyboardEvent<HTMLButtonElement>, datasetIndex: number) => {
    if (!isDatasetNavigationKey(event.key)) {
      return;
    }

    event.preventDefault();
    if (!datasets.length) {
      return;
    }

    if (event.key === "ArrowLeft") {
      return;
    }

    if (event.key === "ArrowRight") {
      onEnterPatientSelection(datasets[datasetIndex].id);
      return;
    }

    if (event.key === "Home") {
      onSelectDataset(datasets[0].id);
      focusDatasetRow(0);
      return;
    }

    if (event.key === "End") {
      onSelectDataset(datasets[datasets.length - 1].id);
      focusDatasetRow(datasets.length - 1);
      return;
    }

    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (datasetIndex + direction + datasets.length) % datasets.length;
    onSelectDataset(datasets[nextIndex].id);
    focusDatasetRow(nextIndex);
  };

  return (
    <aside className="overview-directory" aria-label="Dataset directory">
      <div className="overview-directory-toolbar">
        {directoryLevel === "patients" ? (
          <button type="button" className="overview-back-button" onClick={onBackToDatasets}>
            Back
          </button>
        ) : null}
        <div>
          <p>{directoryLevel === "patients" ? selectedDatasetId : "Datasets"}</p>
          <span>
            {getDirectoryStatus(directoryLevel, datasets.length, subjects.length, isLoadingDatasets, isLoadingSubjects)}
          </span>
        </div>
      </div>

      <div className="overview-directory-section">
        {directoryLevel === "datasets" ? (
          <div className="overview-dataset-list">
            {datasets.map((dataset, datasetIndex) => (
              <div
                key={dataset.id}
                className={
                  dataset.id === selectedDatasetId
                    ? "overview-dataset-row overview-dataset-row--active"
                    : "overview-dataset-row"
                }
              >
                <button
                  id={getDatasetRowId(dataset.id)}
                  type="button"
                  className="overview-dataset-select"
                  onClick={() => onSelectDataset(dataset.id)}
                  onKeyDown={(event) => handleDatasetNavigationKey(event, datasetIndex)}
                >
                  <span>{dataset.id}</span>
                  <small>{dataset.subject_count} patients</small>
                </button>
                <DrillButton label={`Open patients in ${dataset.id}`} onClick={() => onEnterPatientSelection(dataset.id)} />
              </div>
            ))}
            {!isLoadingDatasets && datasets.length === 0 ? (
              <div className="overview-empty-state">No EEG datasets found.</div>
            ) : null}
          </div>
        ) : (
          <PatientList
            subjects={subjects}
            selectedDatasetId={selectedDatasetId}
            isLoadingSubjects={isLoadingSubjects}
            predictionSummariesBySubject={predictionSummariesBySubject}
            hoveredSubjectId={hoveredSubjectId}
            selectedSubjectId={selectedSubjectId}
            focusSubjectId={focusSubjectId}
            modelInfo={modelInfo}
            onOpenWorkspace={onOpenWorkspace}
            onBackToDatasets={onBackToDatasets}
            onHoveredSubjectIdChange={onHoveredSubjectIdChange}
            onSelectedSubjectIdChange={onSelectedSubjectIdChange}
            onFocusSubjectHandled={onFocusSubjectHandled}
          />
        )}
      </div>
    </aside>
  );
}

function getDatasetRowId(datasetId: string): string {
  return `overview-dataset-row-${encodeURIComponent(datasetId)}`;
}

function isDatasetNavigationKey(key: string): key is DatasetNavigationKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "ArrowRight" || key === "ArrowLeft" || key === "Home" || key === "End";
}
