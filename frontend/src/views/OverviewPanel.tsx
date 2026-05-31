import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { StatusOverlay } from "../components/ui";
import { ModelService } from "../services/ModelService";
import { SettingsService } from "../services/SettingsService";
import { TimeseriesService } from "../services/TimeseriesService";
import { useAppStore } from "../stores/useAppStore";
import type {
  ModelPatientEmbeddingsResponse,
  ModelPredictionCacheProgress,
  ModelPredictionCacheStatus,
  PatientAggregationSettings,
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
  selectedSubjectId?: string | null;
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
  const [patientEmbeddings, setPatientEmbeddings] = useState<ModelPatientEmbeddingsResponse | null>(null);
  const [embeddingSelectedSubjectIds, setEmbeddingSelectedSubjectIds] = useState<string[] | null>(null);
  const [embeddingSelectionResetKey, setEmbeddingSelectionResetKey] = useState(0);
  const [isLoadingEmbeddings, setIsLoadingEmbeddings] = useState(false);
  const [embeddingError, setEmbeddingError] = useState<string | null>(null);
  const [hoveredSubjectId, setHoveredSubjectId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [focusSubjectId, setFocusSubjectId] = useState<string | null>(null);
  const [focusDatasetId, setFocusDatasetId] = useState<string | null>(null);
  const [shouldFocusFirstPatient, setShouldFocusFirstPatient] = useState(false);
  const [isStartingCacheJob, setIsStartingCacheJob] = useState(false);
  const [isDeletingCache, setIsDeletingCache] = useState(false);
  const [patientAggregationSettings, setPatientAggregationSettings] = useState<PatientAggregationSettings | null>(null);
  const [isLoadingPatientAggregationSettings, setIsLoadingPatientAggregationSettings] = useState(true);
  const [isSavingPatientAggregationSettings, setIsSavingPatientAggregationSettings] = useState(false);
  const [patientAggregationSettingsError, setPatientAggregationSettingsError] = useState<string | null>(null);
  const [patientAggregationSettingsVersion, setPatientAggregationSettingsVersion] = useState(0);
  const progressSocketRef = useRef<WebSocket | null>(null);
  const modelInfo = useAppStore((state) => state.modelInfo);
  const availableModels = useAppStore((state) => state.availableModels);
  const isLoadingModels = useAppStore((state) => state.isLoadingModels);
  const isSwitchingModel = useAppStore((state) => state.isSwitchingModel);
  const modelInfoError = useAppStore((state) => state.modelError);
  const initializeModelState = useAppStore((state) => state.initializeModelState);
  const setCurrentModel = useAppStore((state) => state.setCurrentModel);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );
  const predictionSummariesBySubject = useMemo(
    () => new Map((cacheStatus?.subject_summaries ?? []).map((summary) => [summary.subject_id, summary])),
    [cacheStatus],
  );
  const embeddingSelectedSubjectIdSet = useMemo(
    () => (embeddingSelectedSubjectIds ? new Set(embeddingSelectedSubjectIds) : null),
    [embeddingSelectedSubjectIds],
  );
  const directorySubjects = useMemo(
    () =>
      embeddingSelectedSubjectIdSet
        ? subjects.filter((subject) => embeddingSelectedSubjectIdSet.has(subject.id))
        : subjects,
    [embeddingSelectedSubjectIdSet, subjects],
  );
  const embeddingRefreshKey = useMemo(
    () =>
      [
        cacheStatus?.checkpoint_key ?? "",
        cacheStatus?.preprocessing_version ?? "",
        cacheStatus?.status ?? "",
        cacheStatus?.completed_subjects ?? 0,
        cacheStatus?.updated_at ?? "",
        patientAggregationSettingsVersion,
      ].join(":"),
    [cacheStatus, patientAggregationSettingsVersion],
  );
  const highlightedSubjectId = hoveredSubjectId ?? selectedSubjectId;
  const activeModelName = modelInfo?.name ?? null;

  const refreshPredictionCacheStatus = useCallback((datasetId: string, modelName: string) => {
    ModelService.getPredictionCacheStatus(datasetId, "derivatives", modelName)
      .then(setCacheStatus)
      .catch((loadError) => setCacheError(getOverviewError(loadError, "Unable to refresh prediction cache status.")));
  }, []);

  const connectPredictionCacheProgress = useCallback(
    (initialProgress: ModelPredictionCacheProgress) => {
      progressSocketRef.current?.close();
      setCacheProgress(initialProgress);

      const socket = ModelService.createPredictionCacheProgressSocket(
        initialProgress.job_id,
        initialProgress.model_name,
      );
      progressSocketRef.current = socket;

      socket.onmessage = (event) => {
        let progress: ModelPredictionCacheProgress;
        try {
          progress = JSON.parse(event.data) as ModelPredictionCacheProgress;
        } catch {
          setCacheError("Prediction progress payload could not be read.");
          return;
        }

        if (progress.dataset_id !== selectedDatasetId || progress.model_name !== activeModelName) {
          return;
        }

        setCacheProgress(progress);
        if (progress.status === "completed" || progress.status === "failed") {
          socket.close();
          refreshPredictionCacheStatus(progress.dataset_id, progress.model_name);
        }
      };
      socket.onerror = () => {
        setCacheError("Prediction progress connection failed.");
      };
    },
    [activeModelName, refreshPredictionCacheStatus, selectedDatasetId],
  );

  useEffect(() => {
    void initializeModelState();
  }, [initializeModelState]);

  useEffect(() => {
    let isCurrent = true;
    setIsLoadingPatientAggregationSettings(true);
    setPatientAggregationSettingsError(null);

    SettingsService.getPatientAggregationSettings()
      .then((settings) => {
        if (isCurrent) {
          setPatientAggregationSettings(settings);
        }
      })
      .catch((loadError) => {
        if (isCurrent) {
          setPatientAggregationSettingsError(
            getOverviewError(loadError, "Unable to load patient aggregation settings."),
          );
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingPatientAggregationSettings(false);
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
      if (!selectedDatasetId || !activeModelName) {
        setSubjects([]);
        setIsLoadingSubjects(false);
        return;
      }

      setIsLoadingSubjects(true);
      setError(null);

      try {
        const nextSubjects = await TimeseriesService.getSubjects(selectedDatasetId, activeModelName);
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
  }, [activeModelName, selectedDatasetId]);

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

    if (!selectedDatasetId || !activeModelName) {
      setIsLoadingEmbeddings(false);
      return;
    }

    setIsLoadingEmbeddings(true);
    ModelService.getPatientEmbeddings(selectedDatasetId, "derivatives", activeModelName)
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
  }, [activeModelName, selectedDatasetId, embeddingRefreshKey]);

  useEffect(() => {
    let isCurrent = true;
    progressSocketRef.current?.close();
    progressSocketRef.current = null;
    setCacheStatus(null);
    setCacheProgress(null);
    setCacheError(null);

    if (!selectedDatasetId || !activeModelName) {
      return;
    }

    async function loadPredictionCacheState() {
      try {
        const [status, activeProgress] = await Promise.all([
          ModelService.getPredictionCacheStatus(selectedDatasetId, "derivatives", activeModelName),
          ModelService.getActivePredictionCacheJob(selectedDatasetId, "derivatives", activeModelName),
        ]);
        if (!isCurrent) {
          return;
        }

        setCacheStatus(status);
        if (activeProgress && isCacheJobRunning(activeProgress)) {
          connectPredictionCacheProgress(activeProgress);
        }
      } catch (loadError) {
        if (isCurrent) {
          setCacheError(getOverviewError(loadError, "Unable to load prediction cache status."));
        }
      }
    }

    loadPredictionCacheState();

    return () => {
      isCurrent = false;
    };
  }, [activeModelName, connectPredictionCacheProgress, selectedDatasetId]);

  useEffect(
    () => () => {
      progressSocketRef.current?.close();
    },
    [],
  );

  const clearOverviewModelData = useCallback(() => {
    progressSocketRef.current?.close();
    progressSocketRef.current = null;
    setCacheStatus(null);
    setCacheProgress(null);
    setCacheError(null);
    setSubjects([]);
    setIsLoadingSubjects(false);
    setError(null);
    setPatientEmbeddings(null);
    setEmbeddingError(null);
    setEmbeddingSelectedSubjectIds(null);
    setEmbeddingSelectionResetKey((current) => current + 1);
    setHoveredSubjectId(null);
    setSelectedSubjectId(null);
    setFocusSubjectId(null);
    setIsStartingCacheJob(false);
    setIsDeletingCache(false);
  }, []);

  const handleModelChange = useCallback(
    (modelName: string) => {
      if (!modelName || modelName === activeModelName || isSwitchingModel || isCacheJobRunning(cacheProgress)) {
        return;
      }

      clearOverviewModelData();
      void setCurrentModel(modelName);
    },
    [activeModelName, cacheProgress, clearOverviewModelData, isSwitchingModel, setCurrentModel],
  );

  const savePatientAggregationSettings = useCallback(
    async (settings: PatientAggregationSettings) => {
      setIsSavingPatientAggregationSettings(true);
      setPatientAggregationSettingsError(null);

      try {
        const nextSettings = await SettingsService.updatePatientAggregationSettings(settings);
        setPatientAggregationSettings(nextSettings);
        setPatientAggregationSettingsVersion((version) => version + 1);
        if (selectedDatasetId && activeModelName) {
          refreshPredictionCacheStatus(selectedDatasetId, activeModelName);
        }
      } catch (saveError) {
        const message = getOverviewError(saveError, "Unable to save patient aggregation settings.");
        setPatientAggregationSettingsError(message);
        throw new Error(message);
      } finally {
        setIsSavingPatientAggregationSettings(false);
      }
    },
    [activeModelName, refreshPredictionCacheStatus, selectedDatasetId],
  );

  const selectDataset = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    setDirectoryLevel("datasets");
    setHoveredSubjectId(null);
    setSelectedSubjectId(null);
    setEmbeddingSelectedSubjectIds(null);
    setEmbeddingSelectionResetKey((current) => current + 1);
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
    setEmbeddingSelectedSubjectIds(null);
    setEmbeddingSelectionResetKey((current) => current + 1);
    setFocusSubjectId(null);
    setShouldFocusFirstPatient(false);
    setFocusDatasetId(selectedDatasetId);
  };

  const openPatientView = (subject: TimeseriesSubjectInfo) => {
    if (!selectedDatasetId) {
      return;
    }

    navigate(`/datasets/${encodeURIComponent(selectedDatasetId)}/patients/${encodeURIComponent(subject.id)}`);
  };

  const openPatientViewBySubjectId = (subjectId: string) => {
    if (!selectedDatasetId) {
      return;
    }

    navigate(`/datasets/${encodeURIComponent(selectedDatasetId)}/patients/${encodeURIComponent(subjectId)}`);
  };

  const selectEmbeddingSubjects = useCallback((subjectIds: string[] | null) => {
    setEmbeddingSelectedSubjectIds(subjectIds);
    setHoveredSubjectId(null);
    if (subjectIds) {
      setDirectoryLevel("patients");
      setSelectedSubjectId((currentSubjectId) =>
        currentSubjectId && subjectIds.includes(currentSubjectId) ? currentSubjectId : null,
      );
    }
  }, []);

  const startPredictionCacheJob = async () => {
    if (!selectedDatasetId || !activeModelName || isStartingCacheJob || isCacheJobRunning(cacheProgress)) {
      return;
    }

    progressSocketRef.current?.close();
    setIsStartingCacheJob(true);
    setCacheError(null);

    try {
      const job = await ModelService.startPredictionCacheJob(selectedDatasetId, "derivatives", activeModelName);
      connectPredictionCacheProgress({
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
    } catch (startError) {
      setCacheError(getOverviewError(startError, "Unable to start prediction cache job."));
    } finally {
      setIsStartingCacheJob(false);
    }
  };

  const deletePredictionCache = async () => {
    if (!selectedDatasetId || !activeModelName || isDeletingCache || isCacheJobRunning(cacheProgress)) {
      return;
    }

    const shouldDelete = window.confirm(`Delete cached predictions for ${selectedDatasetId}?`);
    if (!shouldDelete) {
      return;
    }

    setIsDeletingCache(true);
    setCacheError(null);

    try {
      const nextStatus = await ModelService.deletePredictionCache(selectedDatasetId, "derivatives", activeModelName);
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
        subjects={directorySubjects}
        selectedDatasetId={selectedDatasetId}
        directoryLevel={directoryLevel}
        isLoadingDatasets={isLoadingDatasets}
        isLoadingSubjects={isLoadingSubjects}
        predictionSummariesBySubject={predictionSummariesBySubject}
        hoveredSubjectId={hoveredSubjectId}
        selectedSubjectId={selectedSubjectId}
        focusSubjectId={focusSubjectId}
        focusDatasetId={focusDatasetId}
        modelInfo={modelInfo}
        onSelectDataset={selectDataset}
        onEnterPatientSelection={enterPatientSelection}
        onBackToDatasets={backToDatasets}
        onOpenPatientView={openPatientView}
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
            error={error}
            modelInfo={modelInfo}
          />

          <PatientEmbeddingScatterplot
            embeddings={patientEmbeddings}
            isLoading={isLoadingEmbeddings}
            error={embeddingError}
            highlightedSubjectId={highlightedSubjectId}
            modelInfo={modelInfo}
            selectedSubjectIds={embeddingSelectedSubjectIds}
            selectionResetKey={embeddingSelectionResetKey}
            onOpenSubject={openPatientViewBySubjectId}
            onSelectedSubjectIdsChange={selectEmbeddingSubjects}
          />

          <ModelCard
            modelInfo={modelInfo}
            modelInfoError={modelInfoError}
            availableModels={availableModels}
            isLoadingModels={isLoadingModels}
            isSwitchingModel={isSwitchingModel}
            selectedDatasetId={selectedDatasetId}
            cacheStatus={cacheStatus}
            cacheProgress={cacheProgress}
            cacheError={cacheError}
            patientAggregationSettings={patientAggregationSettings}
            patientAggregationSettingsError={patientAggregationSettingsError}
            isLoadingPatientAggregationSettings={isLoadingPatientAggregationSettings}
            isSavingPatientAggregationSettings={isSavingPatientAggregationSettings}
            isStartingCacheJob={isStartingCacheJob}
            isDeletingCache={isDeletingCache}
            onModelChange={handleModelChange}
            onSavePatientAggregationSettings={savePatientAggregationSettings}
            onStartPredictionCacheJob={startPredictionCacheJob}
            onDeletePredictionCache={deletePredictionCache}
          />
        </div>
      </div>
    </section>
  );
}
