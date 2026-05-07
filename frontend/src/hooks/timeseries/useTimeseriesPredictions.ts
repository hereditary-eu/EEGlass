import { useEffect, useState } from "react";

import { TimeseriesService } from "../../services/TimeseriesService";
import type { ChannelId, ModelInferenceResponse, TimeseriesSignalResponse, TimeseriesSource } from "../../types";
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
  const [inferenceError, setInferenceError] = useState<string | null>(null);

  const resetPredictions = () => {
    setInferenceResult(null);
    setInferenceError(null);
    clearSelectedPredictionWindow();
    onPredictionReset();
  };

  const handleComputeInference = async () => {
    if (!datasetId || !subjectId || !signal || activeChannels.length === 0 || isComputingInference) {
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
    inferenceError,
    resetPredictions,
    handleComputeInference,
  };
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
