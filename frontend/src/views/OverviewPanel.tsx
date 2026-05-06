import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import {
  CLASS_COLORS,
  DEFAULT_MODEL_NAME,
  MODEL_CLASS_LABELS,
  formatCompactClassLabel,
  getPatientClassName,
} from "../constants/eegModel";
import { TimeseriesService } from "../services/TimeseriesService";
import type {
  ModelPredictionCacheProgress,
  ModelPredictionCacheStatus,
  ModelPredictionSummary,
  TimeseriesDatasetInfo,
  TimeseriesSubjectInfo,
} from "../types";
import "./OverviewPanel.css";

type DirectoryLevel = "datasets" | "patients";

export function OverviewPanel() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<TimeseriesDatasetInfo[]>([]);
  const [subjects, setSubjects] = useState<TimeseriesSubjectInfo[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [directoryLevel, setDirectoryLevel] = useState<DirectoryLevel>("datasets");
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(true);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<ModelPredictionCacheStatus | null>(null);
  const [cacheProgress, setCacheProgress] = useState<ModelPredictionCacheProgress | null>(null);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [isStartingCacheJob, setIsStartingCacheJob] = useState(false);
  const [isDeletingCache, setIsDeletingCache] = useState(false);
  const progressSocketRef = useRef<WebSocket | null>(null);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );
  const predictionSummariesBySubject = useMemo(
    () => new Map((cacheStatus?.subject_summaries ?? []).map((summary) => [summary.subject_id, summary])),
    [cacheStatus],
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadDatasets() {
      setIsLoadingDatasets(true);
      setError(null);

      try {
        const nextDatasets = await TimeseriesService.getDatasets();
        if (!isCurrent) {
          return;
        }

        setDatasets(nextDatasets);
        setSelectedDatasetId((currentDatasetId) =>
          nextDatasets.some((dataset) => dataset.id === currentDatasetId)
            ? currentDatasetId
            : (nextDatasets[0]?.id ?? ""),
        );
      } catch (loadError) {
        if (isCurrent) {
          setError(getOverviewError(loadError, "Unable to load datasets."));
        }
      } finally {
        if (isCurrent) {
          setIsLoadingDatasets(false);
        }
      }
    }

    loadDatasets();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function loadSubjects() {
      if (!selectedDatasetId) {
        setSubjects([]);
        return;
      }

      setIsLoadingSubjects(true);
      setError(null);

      try {
        const nextSubjects = await TimeseriesService.getSubjects(selectedDatasetId);
        if (isCurrent) {
          setSubjects(nextSubjects);
        }
      } catch (loadError) {
        if (isCurrent) {
          setSubjects([]);
          setError(getOverviewError(loadError, `Unable to load subjects for ${selectedDatasetId}.`));
        }
      } finally {
        if (isCurrent) {
          setIsLoadingSubjects(false);
        }
      }
    }

    loadSubjects();

    return () => {
      isCurrent = false;
    };
  }, [selectedDatasetId]);

  useEffect(() => {
    let isCurrent = true;
    progressSocketRef.current?.close();
    progressSocketRef.current = null;
    setCacheStatus(null);
    setCacheProgress(null);
    setCacheError(null);

    if (!selectedDatasetId) {
      return;
    }

    TimeseriesService.getPredictionCacheStatus(selectedDatasetId)
      .then((status) => {
        if (isCurrent) {
          setCacheStatus(status);
        }
      })
      .catch((loadError) => {
        if (isCurrent) {
          setCacheError(getOverviewError(loadError, "Unable to load prediction cache status."));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedDatasetId]);

  useEffect(
    () => () => {
      progressSocketRef.current?.close();
    },
    [],
  );

  const selectDataset = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    setDirectoryLevel("datasets");
  };

  const enterPatientSelection = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    setDirectoryLevel("patients");
  };

  const openWorkspace = (subject: TimeseriesSubjectInfo) => {
    if (!selectedDatasetId) {
      return;
    }

    navigate(`/workspace/${encodeURIComponent(selectedDatasetId)}/${encodeURIComponent(subject.id)}`);
  };

  const startPredictionCacheJob = async () => {
    if (!selectedDatasetId || isStartingCacheJob || isCacheJobRunning(cacheProgress)) {
      return;
    }

    progressSocketRef.current?.close();
    setIsStartingCacheJob(true);
    setCacheError(null);

    try {
      const job = await TimeseriesService.startPredictionCacheJob(selectedDatasetId);
      setCacheProgress({
        job_id: job.job_id,
        dataset_id: job.dataset_id,
        model_name: job.model_name,
        source: job.source,
        status: job.status,
        done: 0,
        total: cacheStatus?.total_subjects ?? 0,
        failed: 0,
        current_subject_id: null,
        message: "Queued",
      });

      const socket = TimeseriesService.createPredictionCacheProgressSocket(job.job_id);
      progressSocketRef.current = socket;
      socket.onmessage = (event) => {
        let progress: ModelPredictionCacheProgress;
        try {
          progress = JSON.parse(event.data) as ModelPredictionCacheProgress;
        } catch {
          setCacheError("Prediction progress payload could not be read.");
          return;
        }

        setCacheProgress(progress);
        if (progress.status === "completed" || progress.status === "failed") {
          socket.close();
          TimeseriesService.getPredictionCacheStatus(selectedDatasetId)
            .then(setCacheStatus)
            .catch((loadError) => setCacheError(getOverviewError(loadError, "Unable to refresh prediction cache status.")));
        }
      };
      socket.onerror = () => {
        setCacheError("Prediction progress connection failed.");
      };
    } catch (startError) {
      setCacheError(getOverviewError(startError, "Unable to start prediction cache job."));
    } finally {
      setIsStartingCacheJob(false);
    }
  };

  const deletePredictionCache = async () => {
    if (!selectedDatasetId || isDeletingCache || isCacheJobRunning(cacheProgress)) {
      return;
    }

    const shouldDelete = window.confirm(`Delete cached predictions for ${selectedDatasetId}?`);
    if (!shouldDelete) {
      return;
    }

    setIsDeletingCache(true);
    setCacheError(null);

    try {
      const nextStatus = await TimeseriesService.deletePredictionCache(selectedDatasetId);
      setCacheStatus(nextStatus);
      setCacheProgress(null);
    } catch (deleteError) {
      setCacheError(getOverviewError(deleteError, "Unable to delete prediction cache."));
    } finally {
      setIsDeletingCache(false);
    }
  };

  return (
    <section className="overview-panel" aria-label="Dataset and patient overview">
      <aside className="overview-directory" aria-label="Dataset directory">
        <div className="overview-directory-toolbar">
          {directoryLevel === "patients" ? (
            <button type="button" className="overview-back-button" onClick={() => setDirectoryLevel("datasets")}>
              Back
            </button>
          ) : null}
          <div>
            <p>{directoryLevel === "patients" ? selectedDatasetId : "Datasets"}</p>
            <span>{getDirectoryStatus(directoryLevel, datasets.length, subjects.length, isLoadingDatasets, isLoadingSubjects)}</span>
          </div>
        </div>

        <div className="overview-directory-section">
          {directoryLevel === "datasets" ? (
            <div className="overview-dataset-list">
              {datasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className={
                    dataset.id === selectedDatasetId
                      ? "overview-dataset-row overview-dataset-row--active"
                      : "overview-dataset-row"
                  }
                >
                  <button type="button" className="overview-dataset-select" onClick={() => selectDataset(dataset.id)}>
                    <span>{dataset.id}</span>
                    <small>{dataset.subject_count} patients</small>
                  </button>
                  <OverviewDrillButton
                    label={`Open patients in ${dataset.id}`}
                    onClick={() => enterPatientSelection(dataset.id)}
                  />
                </div>
              ))}
              {!isLoadingDatasets && datasets.length === 0 ? (
                <div className="overview-empty-state">No EEG datasets found.</div>
              ) : null}
            </div>
          ) : (
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
              {subjects.map((subject) => {
                const summary = predictionSummariesBySubject.get(subject.id) ?? null;
                return (
                  <div
                    key={subject.id}
                    className={
                      isPredictionMismatch(summary)
                        ? "overview-patient-card overview-patient-card--mismatch"
                        : "overview-patient-card"
                    }
                  >
                    <div className="overview-patient-select">
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
                      <span
                        className={`overview-patient-label ${getPatientClassName(summary?.true_label)}`}
                        title={summary?.true_label ?? undefined}
                      >
                        {formatCompactClassLabel(summary?.true_label)}
                      </span>
                      <span
                        className={`overview-patient-label ${getPatientClassName(summary?.predicted_label)}`}
                        title={summary?.predicted_label ?? undefined}
                      >
                        {formatCompactClassLabel(summary?.predicted_label)}
                      </span>
                      <span className="overview-patient-confidence">{formatMeanConfidence(summary)}</span>
                      {summary ? (
                        <span className="overview-patient-distribution" style={getClassDistributionStyle(summary)} />
                      ) : null}
                    </div>
                    <OverviewDrillButton label={`Open workspace for ${subject.id}`} onClick={() => openWorkspace(subject)} />
                  </div>
                );
              })}
              {!isLoadingSubjects && selectedDatasetId && subjects.length === 0 ? (
                <div className="overview-empty-state">No patients found for this dataset.</div>
              ) : null}
            </div>
          )}
        </div>
      </aside>

      <div className="overview-content" aria-label="Dataset overview">
        {error ? <div className="overview-error">{error}</div> : null}

        <div className="overview-placeholder-grid">
          <section className="overview-placeholder-card overview-dataset-summary-card">
            <p className="overview-kicker">Dataset Summary</p>
            <h3>{selectedDataset?.name || selectedDataset?.id || "Dataset summary"}</h3>
            {selectedDataset ? (
              <dl className="overview-metrics overview-metrics--summary">
                <div>
                  <dt>Dataset ID</dt>
                  <dd>{selectedDataset.id}</dd>
                </div>
                <div>
                  <dt>Patients</dt>
                  <dd>{selectedDataset.subject_count}</dd>
                </div>
                <div>
                  <dt>Sources</dt>
                  <dd>{selectedDataset.sources.join(", ") || "None"}</dd>
                </div>
              </dl>
            ) : null}
            <p>TODO: Reserved for cohort-level distributions, label counts, and signal quality metrics.</p>
          </section>

          <section className="overview-placeholder-card overview-placeholder-card--wide">
            <p className="overview-kicker">Patient embedding</p>
            <h3>Activation scatterplot</h3>
            <p>
              TODO: Reserved for a future embedding of last-layer activations. Selecting a patient card can highlight the
              matching datapoint here.
            </p>
          </section>

          <section className="overview-placeholder-card overview-model-card">
            <div className="overview-model-card-header">
              <div>
                <p className="overview-kicker">Model card</p>
                <h3>xEEGNet v1</h3>
              </div>
              <button
                type="button"
                className="overview-model-config-button"
                title="Model settings and metadata panel"
                aria-label="Open model settings and metadata panel"
              >
                {"\u2699"}
              </button>
            </div>

            <dl className="overview-model-details">
              <div>
                <dt>API name</dt>
                <dd>{DEFAULT_MODEL_NAME}</dd>
              </div>
              <div>
                <dt>Architecture</dt>
                <dd>xEEGNet</dd>
              </div>
              <div>
                <dt>Input</dt>
                <dd>19 channels, 4s windows, 125 Hz</dd>
              </div>
              <div>
                <dt>Classes</dt>
                <dd>Healthy, Alzheimer, FTD</dd>
              </div>
            </dl>

            <div className="overview-model-cache">
              <div className="overview-model-cache-toolbar">
                <div>
                  <p className="overview-model-cache-label">Prediction cache</p>
                  <span>{getCacheSummary(cacheStatus, cacheProgress)}</span>
                </div>
                <div className="overview-model-cache-actions">
                  <button
                    type="button"
                    className="overview-model-compute-button"
                    onClick={startPredictionCacheJob}
                    disabled={!selectedDatasetId || isStartingCacheJob || isCacheJobRunning(cacheProgress)}
                  >
                    Compute all
                  </button>
                  <button
                    type="button"
                    className="overview-model-delete-button"
                    onClick={deletePredictionCache}
                    disabled={
                      !selectedDatasetId ||
                      isDeletingCache ||
                      isCacheJobRunning(cacheProgress) ||
                      cacheStatus?.status === "missing"
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
              {isCacheJobRunning(cacheProgress) ? (
                <PredictionCacheProgressBar progress={cacheProgress} />
              ) : null}
              {cacheError ? <p className="overview-model-cache-error">{cacheError}</p> : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

interface OverviewDrillButtonProps {
  label: string;
  onClick: () => void;
}

function OverviewDrillButton({ label, onClick }: OverviewDrillButtonProps) {
  return (
    <button type="button" className="overview-drill-button" aria-label={label} onClick={onClick}>
      <span aria-hidden="true" />
    </button>
  );
}

interface PredictionCacheProgressBarProps {
  progress: ModelPredictionCacheProgress;
}

function PredictionCacheProgressBar({ progress }: PredictionCacheProgressBarProps) {
  const total = progress.total || 0;
  const done = progress.done;
  const percent = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
  const label = progress.current_subject_id ?? progress.message ?? "prediction-cache";

  return (
    <div className="overview-model-progress-row">
      <span className="overview-model-progress-label">{label}</span>
      <div
        className="overview-model-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="Prediction cache progress"
      >
        <div className="overview-model-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="overview-model-progress-count">
        {done}/{total || "?"}
      </span>
    </div>
  );
}

function isCacheJobRunning(progress: ModelPredictionCacheProgress | null): boolean {
  return progress?.status === "queued" || progress?.status === "running";
}

function getCacheSummary(
  status: ModelPredictionCacheStatus | null,
  progress: ModelPredictionCacheProgress | null,
): string {
  if (progress && isCacheJobRunning(progress)) {
    return `${progress.done}/${progress.total || "?"} predicted - ${progress.failed} failed`;
  }

  if (progress?.status === "completed") {
    return `${progress.done}/${progress.total} predicted - ${progress.failed} failed`;
  }

  if (!status) {
    return "Prediction status unavailable";
  }

  if (status.status === "complete") {
    return `${status.completed_subjects}/${status.total_subjects} predictions ready`;
  }

  if (status.status === "partial") {
    return `${status.completed_subjects}/${status.total_subjects} predictions ready - ${status.failed_subjects} failed`;
  }

  return `No predictions cached - ${status.total_subjects} patients`;
}

function formatMeanConfidence(summary: ModelPredictionSummary | null): string {
  return summary?.mean_confidence === null || summary?.mean_confidence === undefined
    ? "--"
    : `${Math.round(summary.mean_confidence * 100)}%`;
}

function isPredictionMismatch(summary: ModelPredictionSummary | null): boolean {
  return Boolean(summary?.true_label && summary.predicted_label && summary.true_label !== summary.predicted_label);
}

function getClassWindowCount(summary: ModelPredictionSummary | null, classLabel: string): string {
  if (!summary) {
    return "--";
  }

  return String(summary.windows_per_class.find((entry) => entry.class_label === classLabel)?.count ?? 0);
}

function getClassDistributionStyle(summary: ModelPredictionSummary): CSSProperties {
  const healthy = getClassWindowCountNumber(summary, MODEL_CLASS_LABELS[0]);
  const alzheimer = getClassWindowCountNumber(summary, MODEL_CLASS_LABELS[1]);
  const ftd = getClassWindowCountNumber(summary, MODEL_CLASS_LABELS[2]);
  const total = Math.max(1, healthy + alzheimer + ftd);
  const healthyStop = (healthy / total) * 100;
  const alzheimerStop = healthyStop + (alzheimer / total) * 100;

  return {
    background: `linear-gradient(90deg,
      ${CLASS_COLORS.distribution.Healthy} 0%,
      ${CLASS_COLORS.distribution.Healthy} ${healthyStop}%,
      ${CLASS_COLORS.distribution.Alzheimer} ${healthyStop}%,
      ${CLASS_COLORS.distribution.Alzheimer} ${alzheimerStop}%,
      ${CLASS_COLORS.distribution["Frontotemporal Dementia"]} ${alzheimerStop}%,
      ${CLASS_COLORS.distribution["Frontotemporal Dementia"]} 100%)`,
  };
}

function getClassWindowCountNumber(summary: ModelPredictionSummary, classLabel: string): number {
  return summary.windows_per_class.find((entry) => entry.class_label === classLabel)?.count ?? 0;
}

function getDirectoryStatus(
  directoryLevel: DirectoryLevel,
  datasetCount: number,
  subjectCount: number,
  isLoadingDatasets: boolean,
  isLoadingSubjects: boolean,
): string {
  if (directoryLevel === "patients") {
    return isLoadingSubjects ? "Loading patients" : `${subjectCount} patients`;
  }

  return isLoadingDatasets ? "Loading datasets" : `${datasetCount} datasets`;
}

function getOverviewError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}
