import { useCallback, useEffect, useRef, useState } from "react";

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
  isAbortError,
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
  const activeContextRef = useRef({ datasetId, subjectId, source });
  const cachedPredictionRequestIdRef = useRef(0);
  const computePredictionRequestIdRef = useRef(0);
  const computeAbortControllerRef = useRef<AbortController | null>(null);
  const isDatasetPredictionJobRunning = isPredictionCacheJobRunning(activePredictionCacheProgress);

  activeContextRef.current = { datasetId, subjectId, source };

  const isCurrentContext = useCallback(
    (context: { datasetId: string; subjectId: string; source: TimeseriesSource }) => {
      const activeContext = activeContextRef.current;
      return (
        activeContext.datasetId === context.datasetId &&
        activeContext.subjectId === context.subjectId &&
        activeContext.source === context.source
      );
    },
    [],
  );

  useEffect(
    () => () => {
      computeAbortControllerRef.current?.abort();
    },
    [],
  );

  const resetPredictions = useCallback(() => {
    computeAbortControllerRef.current?.abort();
    computeAbortControllerRef.current = null;
    cachedPredictionRequestIdRef.current += 1;
    computePredictionRequestIdRef.current += 1;
    setInferenceResult(null);
    setInferenceError(null);
    setIsComputingInference(false);
    clearSelectedPredictionWindow();
    onPredictionReset();
  }, [clearSelectedPredictionWindow, onPredictionReset]);

  const handleComputeInference = useCallback(async () => {
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

    computeAbortControllerRef.current?.abort();
    const requestContext = { datasetId, subjectId, source };
    const requestId = computePredictionRequestIdRef.current + 1;
    computePredictionRequestIdRef.current = requestId;
    const abortController = new AbortController();
    computeAbortControllerRef.current = abortController;
    const isActiveRequest = () =>
      computePredictionRequestIdRef.current === requestId &&
      !abortController.signal.aborted &&
      isCurrentContext(requestContext);

    setIsComputingInference(true);
    setInferenceError(null);
    setInferenceResult(null);
    clearSelectedPredictionWindow();
    onPredictionReset();

    try {
      const response = await TimeseriesService.computeAndCachePredictions(datasetId, subjectId, source, undefined, {
        signal: abortController.signal,
      });
      if (!isActiveRequest()) {
        return;
      }

      setInferenceResult(response);
      setLockedPredictionWindowIndex(response.predictions.length > 0 ? 0 : null);
    } catch (computeError) {
      if (isAbortError(computeError) || !isActiveRequest()) {
        return;
      }

      setInferenceResult(null);
      setInferenceError(getInferenceErrorMessage(computeError));
    } finally {
      if (isActiveRequest()) {
        setIsComputingInference(false);
      }
      if (computeAbortControllerRef.current === abortController) {
        computeAbortControllerRef.current = null;
      }
    }
  }, [
    activeChannels.length,
    clearSelectedPredictionWindow,
    datasetId,
    isComputingInference,
    isCurrentContext,
    isDatasetPredictionJobRunning,
    onPredictionReset,
    setLockedPredictionWindowIndex,
    signal,
    source,
    subjectId,
  ]);

  useEffect(() => {
    if (!datasetId) {
      setActivePredictionCacheProgress(null);
      return;
    }

    let isCurrent = true;
    let socket: WebSocket | null = null;
    const abortController = new AbortController();

    TimeseriesService.getActivePredictionCacheJob(datasetId, source, undefined, {
      signal: abortController.signal,
    })
      .then((progress) => {
        if (!isCurrent || abortController.signal.aborted) {
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
      .catch((loadError) => {
        if (isAbortError(loadError)) {
          return;
        }

        if (isCurrent && !abortController.signal.aborted) {
          setActivePredictionCacheProgress(null);
        }
      });

    return () => {
      isCurrent = false;
      abortController.abort();
      socket?.close();
    };
  }, [datasetId, source]);

  useEffect(() => {
    if (!datasetId || !subjectId) {
      cachedPredictionRequestIdRef.current += 1;
      setInferenceResult(null);
      setInferenceError(null);
      setIsComputingInference(false);
      return;
    }

    if (isLoadingSubjects || !isSelectedSubjectReady) {
      cachedPredictionRequestIdRef.current += 1;
      setInferenceResult(null);
      setInferenceError(null);
      setIsComputingInference(false);
      return;
    }

    let isCurrent = true;
    const requestContext = { datasetId, subjectId, source };
    const requestId = cachedPredictionRequestIdRef.current + 1;
    cachedPredictionRequestIdRef.current = requestId;
    const abortController = new AbortController();
    const isActiveRequest = () =>
      isCurrent &&
      cachedPredictionRequestIdRef.current === requestId &&
      !abortController.signal.aborted &&
      isCurrentContext(requestContext);

    setIsComputingInference(true);
    setInferenceError(null);
    setInferenceResult(null);
    clearSelectedPredictionWindow();
    onPredictionReset();

    getCachedPredictionsWithRetry(datasetId, subjectId, source, abortController.signal)
      .then((response) => {
        if (isActiveRequest()) {
          setInferenceResult(response);
          setLockedPredictionWindowIndex(response.predictions.length > 0 ? 0 : null);
        }
      })
      .catch((loadError) => {
        if (isAbortError(loadError) || !isActiveRequest()) {
          return;
        }

        setInferenceResult(null);
        setInferenceError(getPredictionCacheErrorMessage(loadError));
      })
      .finally(() => {
        if (isActiveRequest()) {
          setIsComputingInference(false);
        }
      });

    return () => {
      isCurrent = false;
      abortController.abort();
    };
  }, [
    clearSelectedPredictionWindow,
    datasetId,
    isLoadingSubjects,
    isSelectedSubjectReady,
    isCurrentContext,
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
  signal?: AbortSignal,
): Promise<ModelInferenceResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= PREDICTION_CACHE_RETRY_COUNT; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    try {
      return await TimeseriesService.getCachedPredictions(datasetId, subjectId, source, undefined, { signal });
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || signal?.aborted) {
        throw error;
      }
      if (getErrorStatusCode(error) !== 404 || attempt === PREDICTION_CACHE_RETRY_COUNT) {
        throw error;
      }
      await wait(PREDICTION_CACHE_RETRY_DELAY_MS, signal);
    }
  }

  throw lastError;
}
