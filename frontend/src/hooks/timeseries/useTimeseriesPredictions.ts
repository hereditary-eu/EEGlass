import { useEffect, useState } from "react";

import { TimeseriesService } from "../../services/TimeseriesService";
import type {
  ChannelId,
  ModelInferenceResponse,
  ModelPredictionCacheProgress,
  TimeseriesSignalResponse,
  TimeseriesSource,
} from "../../types";
import {
  getErrorStatusCode,
  getInferenceErrorMessage,
  getPredictionCacheErrorMessage,
  PREDICTION_CACHE_RETRY_COUNT,
  PREDICTION_CACHE_RETRY_DELAY_MS,
  wait,
} from "./shared";

interface UseTimeseriesPredictionsOptions {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  signal: TimeseriesSignalResponse | null;
  activeChannels: ChannelId[];
  isLoadingSubjects: boolean;
  isSelectedSubjectReady: boolean;
  setLockedPredictionWindowIndex: (windowIndex: number | null) => void;
  clearSelectedPredictionWindow: () => void;
  onPredictionReset: () => void;
}

export function useTimeseriesPredictions({
  datasetId,
  subjectId,
  source,
  signal,
  activeChannels,
  isLoadingSubjects,
  isSelectedSubjectReady,
  setLockedPredictionWindowIndex,
  clearSelectedPredictionWindow,
  onPredictionReset,
}: UseTimeseriesPredictionsOptions) {
  const [inferenceResult, setInferenceResult] = useState<ModelInferenceResponse | null>(null);
  const [isComputingInference, setIsComputingInference] = useState(false);
  const [activePredictionCacheProgress, setActivePredictionCacheProgress] =
    useState<ModelPredictionCacheProgress | null>(null);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const isDatasetPredictionJobRunning = isPredictionCacheJobRunning(activePredictionCacheProgress);

  const resetPredictions = () => {
    setInferenceResult(null);
    setInferenceError(null);
    clearSelectedPredictionWindow();
    onPredictionReset();
  };

  const handleComputeInference = async () => {
    if (
      !datasetId ||
      !subjectId ||
      !signal ||
      activeChannels.length === 0 ||
      isComputingInference ||
      isDatasetPredictionJobRunning
    ) {
      return;
    }

    setIsComputingInference(true);
    setInferenceError(null);
    setInferenceResult(null);
    clearSelectedPredictionWindow();
    onPredictionReset();

    try {
      const response = await TimeseriesService.computeAndCachePredictions(datasetId, subjectId, source);
      setInferenceResult(response);
      setLockedPredictionWindowIndex(response.predictions.length > 0 ? 0 : null);
    } catch (computeError) {
      setInferenceResult(null);
      setInferenceError(getInferenceErrorMessage(computeError));
    } finally {
      setIsComputingInference(false);
    }
  };

  useEffect(() => {
    if (!datasetId) {
      setActivePredictionCacheProgress(null);
      return;
    }

    let isCurrent = true;
    let socket: WebSocket | null = null;

    TimeseriesService.getActivePredictionCacheJob(datasetId, source)
      .then((progress) => {
        if (!isCurrent) {
          return;
        }

        if (!progress || !isPredictionCacheJobRunning(progress)) {
          setActivePredictionCacheProgress(null);
          return;
        }

        setActivePredictionCacheProgress(progress);
        socket = TimeseriesService.createPredictionCacheProgressSocket(progress.job_id, progress.model_name);
        socket.onmessage = (event) => {
          let nextProgress: ModelPredictionCacheProgress;
          try {
            nextProgress = JSON.parse(event.data) as ModelPredictionCacheProgress;
          } catch {
            return;
          }

          if (!isCurrent || nextProgress.dataset_id !== datasetId) {
            return;
          }

          setActivePredictionCacheProgress(nextProgress);
          if (!isPredictionCacheJobRunning(nextProgress)) {
            socket?.close();
          }
        };
      })
      .catch(() => {
        if (isCurrent) {
          setActivePredictionCacheProgress(null);
        }
      });

    return () => {
      isCurrent = false;
      socket?.close();
    };
  }, [datasetId, source]);

  useEffect(() => {
    if (!datasetId || !subjectId) {
      setInferenceResult(null);
      setInferenceError(null);
      setIsComputingInference(false);
      return;
    }

    if (isLoadingSubjects || !isSelectedSubjectReady) {
      setInferenceResult(null);
      setInferenceError(null);
      setIsComputingInference(false);
      return;
    }

    let isCurrent = true;
    setIsComputingInference(true);
    setInferenceError(null);
    setInferenceResult(null);
    clearSelectedPredictionWindow();
    onPredictionReset();

    getCachedPredictionsWithRetry(datasetId, subjectId, source)
      .then((response) => {
        if (isCurrent) {
          setInferenceResult(response);
          setLockedPredictionWindowIndex(response.predictions.length > 0 ? 0 : null);
        }
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setInferenceResult(null);
        setInferenceError(getPredictionCacheErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsComputingInference(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [
    clearSelectedPredictionWindow,
    datasetId,
    isLoadingSubjects,
    isSelectedSubjectReady,
    onPredictionReset,
    setLockedPredictionWindowIndex,
    source,
    subjectId,
  ]);

  return {
    inferenceResult,
    isComputingInference,
    isDatasetPredictionJobRunning,
    inferenceError,
    resetPredictions,
    handleComputeInference,
  };
}

function isPredictionCacheJobRunning(progress: ModelPredictionCacheProgress | null): boolean {
  return progress?.status === "queued" || progress?.status === "running";
}

async function getCachedPredictionsWithRetry(
  datasetId: string,
  subjectId: string,
  source: TimeseriesSource,
): Promise<ModelInferenceResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= PREDICTION_CACHE_RETRY_COUNT; attempt += 1) {
    try {
      return await TimeseriesService.getCachedPredictions(datasetId, subjectId, source);
    } catch (error) {
      lastError = error;
      if (getErrorStatusCode(error) !== 404 || attempt === PREDICTION_CACHE_RETRY_COUNT) {
        throw error;
      }
      await wait(PREDICTION_CACHE_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}
