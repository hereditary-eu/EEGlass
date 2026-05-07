import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { StatusOverlay } from "../components/ui";
import { TimeseriesService } from "../services/TimeseriesService";
import type {
  ModelPatientEmbeddingsResponse,
  ModelInfoResponse,
  ModelPredictionCacheProgress,
  ModelPredictionCacheStatus,
  TimeseriesDatasetInfo,
  TimeseriesSubjectInfo,
} from "../types";
import { DatasetDirectory } from "./overview/DatasetDirectory";
import { DatasetSummaryCard } from "./overview/DatasetSummaryCard";
import { ModelCard } from "./overview/ModelCard";
import { PatientEmbeddingScatterplot } from "./overview/PatientEmbeddingScatterplot";
import type { DirectoryLevel } from "./overview/overviewUtils";
import { getOverviewError, isCacheJobRunning } from "./overview/overviewUtils";
import "./OverviewPanel.css";

interface OverviewRouteState {
  datasetId?: string;
  directoryLevel?: DirectoryLevel;
  selectedSubjectId?: string;
}

export function OverviewPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state ?? null) as OverviewRouteState | null;
  const shouldRestoreRouteStateRef = useRef(Boolean(routeState?.datasetId) && location.key !== "default");
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
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);
  const [modelInfoError, setModelInfoError] = useState<string | null>(null);
  const [patientEmbeddings, setPatientEmbeddings] = useState<ModelPatientEmbeddingsResponse | null>(null);
  const [isLoadingEmbeddings, setIsLoadingEmbeddings] = useState(false);
  const [embeddingError, setEmbeddingError] = useState<string | null>(null);
  const [hoveredSubjectId, setHoveredSubjectId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [focusSubjectId, setFocusSubjectId] = useState<string | null>(null);
  const [focusDatasetId, setFocusDatasetId] = useState<string | null>(null);
  const [shouldFocusFirstPatient, setShouldFocusFirstPatient] = useState(false);
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
  const embeddingRefreshKey = useMemo(
    () =>
      [
        cacheStatus?.checkpoint_key ?? "",
        cacheStatus?.preprocessing_version ?? "",
        cacheStatus?.status ?? "",
        cacheStatus?.completed_subjects ?? 0,
        cacheStatus?.updated_at ?? "",
      ].join(":"),
    [cacheStatus],
  );
  const highlightedSubjectId = hoveredSubjectId ?? selectedSubjectId;

  useEffect(() => {
    let isCurrent = true;

    TimeseriesService.getModelInfo()
      .then((nextModelInfo) => {
        if (isCurrent) {
          setModelInfo(nextModelInfo);
          setModelInfoError(null);
        }
      })
      .catch((loadError) => {
        if (isCurrent) {
          setModelInfo(null);
          setModelInfoError(getOverviewError(loadError, "Unable to load model metadata."));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

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

        const routeDatasetId =
          shouldRestoreRouteStateRef.current &&
          routeState?.datasetId &&
          nextDatasets.some((dataset) => dataset.id === routeState.datasetId)
            ? routeState.datasetId
            : "";

        setDatasets(nextDatasets);
        setSelectedDatasetId((currentDatasetId) => {
          if (routeDatasetId) {
            return routeDatasetId;
          }

          return nextDatasets.some((dataset) => dataset.id === currentDatasetId)
            ? currentDatasetId
            : (nextDatasets[0]?.id ?? "");
        });
        if (routeDatasetId) {
          setDirectoryLevel(routeState?.directoryLevel ?? "datasets");
          setSelectedSubjectId(routeState?.selectedSubjectId ?? null);
          setFocusSubjectId(routeState?.directoryLevel === "patients" ? (routeState.selectedSubjectId ?? null) : null);
          navigate(".", { replace: true, state: null });
        }
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
    setSelectedSubjectId((currentSubjectId) =>
      currentSubjectId && subjects.some((subject) => subject.id === currentSubjectId) ? currentSubjectId : null,
    );
  }, [subjects]);

  useEffect(() => {
    if (!shouldFocusFirstPatient || directoryLevel !== "patients" || isLoadingSubjects) {
      return;
    }

    setFocusSubjectId(subjects[0]?.id ?? null);
    setShouldFocusFirstPatient(false);
  }, [directoryLevel, isLoadingSubjects, shouldFocusFirstPatient, subjects]);

  useEffect(() => {
    let isCurrent = true;
    setPatientEmbeddings(null);
    setEmbeddingError(null);

    if (!selectedDatasetId) {
      setIsLoadingEmbeddings(false);
      return;
    }

    setIsLoadingEmbeddings(true);
    TimeseriesService.getPatientEmbeddings(selectedDatasetId)
      .then((embeddings) => {
        if (isCurrent) {
          setPatientEmbeddings(embeddings);
        }
      })
      .catch((loadError) => {
        if (isCurrent) {
          setEmbeddingError(getOverviewError(loadError, "Unable to load patient embeddings."));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingEmbeddings(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedDatasetId, embeddingRefreshKey]);

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
    setHoveredSubjectId(null);
    setSelectedSubjectId(null);
    setFocusSubjectId(null);
    setFocusDatasetId(datasetId);
    setShouldFocusFirstPatient(false);
  };

  const enterPatientSelection = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    setDirectoryLevel("patients");
    setHoveredSubjectId(null);
    setSelectedSubjectId(null);
    setFocusSubjectId(null);
    setFocusDatasetId(null);
    setShouldFocusFirstPatient(true);
  };

  const backToDatasets = () => {
    setDirectoryLevel("datasets");
    setHoveredSubjectId(null);
    setFocusSubjectId(null);
    setShouldFocusFirstPatient(false);
    setFocusDatasetId(selectedDatasetId);
  };

  const openWorkspace = (subject: TimeseriesSubjectInfo) => {
    if (!selectedDatasetId) {
      return;
    }

    navigate(`/workspace/${encodeURIComponent(selectedDatasetId)}/${encodeURIComponent(subject.id)}`);
  };

  const openWorkspaceBySubjectId = (subjectId: string) => {
    if (!selectedDatasetId) {
      return;
    }

    navigate(`/workspace/${encodeURIComponent(selectedDatasetId)}/${encodeURIComponent(subjectId)}`);
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
      <DatasetDirectory
        datasets={datasets}
        subjects={subjects}
        selectedDatasetId={selectedDatasetId}
        directoryLevel={directoryLevel}
        isLoadingDatasets={isLoadingDatasets}
        isLoadingSubjects={isLoadingSubjects}
        predictionSummariesBySubject={predictionSummariesBySubject}
        hoveredSubjectId={hoveredSubjectId}
        selectedSubjectId={selectedSubjectId}
        focusSubjectId={focusSubjectId}
        focusDatasetId={focusDatasetId}
        onSelectDataset={selectDataset}
        onEnterPatientSelection={enterPatientSelection}
        onBackToDatasets={backToDatasets}
        onOpenWorkspace={openWorkspace}
        onHoveredSubjectIdChange={setHoveredSubjectId}
        onSelectedSubjectIdChange={setSelectedSubjectId}
        onFocusSubjectHandled={() => setFocusSubjectId(null)}
        onFocusDatasetHandled={() => setFocusDatasetId(null)}
      />

      <div className="overview-content" aria-label="Dataset overview">
        <StatusOverlay message={error} />

        <div className="overview-placeholder-grid">
          <DatasetSummaryCard
            dataset={selectedDataset}
            subjects={subjects}
            cacheStatus={cacheStatus}
            isLoadingSubjects={isLoadingSubjects}
          />

          <PatientEmbeddingScatterplot
            embeddings={patientEmbeddings}
            isLoading={isLoadingEmbeddings}
            error={embeddingError}
            highlightedSubjectId={highlightedSubjectId}
            onOpenSubject={openWorkspaceBySubjectId}
          />

          <ModelCard
            modelInfo={modelInfo}
            modelInfoError={modelInfoError}
            selectedDatasetId={selectedDatasetId}
            cacheStatus={cacheStatus}
            cacheProgress={cacheProgress}
            cacheError={cacheError}
            isStartingCacheJob={isStartingCacheJob}
            isDeletingCache={isDeletingCache}
            onStartPredictionCacheJob={startPredictionCacheJob}
            onDeletePredictionCache={deletePredictionCache}
          />
        </div>
      </div>
    </section>
  );
}
