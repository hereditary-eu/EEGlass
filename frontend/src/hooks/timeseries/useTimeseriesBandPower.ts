import { useCallback, useEffect, useRef, useState } from "react";

import { ModelService } from "../../services/ModelService";
import type { ModelBandPowerResponse, ModelBandPowerStatsMode, ModelBandPowerStatsResponse } from "../../types";
import { getBandPowerErrorMessage, getErrorStatusCode, MODEL_INPUT_SOURCE } from "./shared";

interface UseTimeseriesBandPowerOptions {
  datasetId: string;
  subjectId: string;
  modelName: string | null | undefined;
  lockedPredictionWindowIndex: number | null;
}

export function useTimeseriesBandPower({
  datasetId,
  subjectId,
  modelName,
  lockedPredictionWindowIndex,
}: UseTimeseriesBandPowerOptions) {
  const [bandPower, setBandPower] = useState<ModelBandPowerResponse | null>(null);
  const [bandPowerStats, setBandPowerStats] = useState<ModelBandPowerStatsResponse[]>([]);
  const [bandPowerStatsMode, setBandPowerStatsMode] = useState<ModelBandPowerStatsMode>("intra_patient");
  const [bandPowerStatsCohortLabels, setBandPowerStatsCohortLabels] = useState<string[]>([]);
  const [isLoadingBandPower, setIsLoadingBandPower] = useState(false);
  const [isLoadingBandPowerStats, setIsLoadingBandPowerStats] = useState(false);
  const [isInterBandPowerStatsUnavailable, setIsInterBandPowerStatsUnavailable] = useState(false);
  const [bandPowerError, setBandPowerError] = useState<string | null>(null);
  const [bandPowerStatsError, setBandPowerStatsError] = useState<string | null>(null);
  const bandPowerCacheRef = useRef(new Map<string, ModelBandPowerResponse>());
  const bandPowerStatsCacheRef = useRef(new Map<string, ModelBandPowerStatsResponse>());
  const canLoadBandPowerStats = Boolean(datasetId && subjectId && modelName && lockedPredictionWindowIndex !== null);

  const clearBandPowerData = useCallback(() => {
    bandPowerCacheRef.current.clear();
    bandPowerStatsCacheRef.current.clear();
    setBandPower(null);
    setBandPowerStats([]);
    setBandPowerStatsCohortLabels([]);
    setIsLoadingBandPower(false);
    setIsLoadingBandPowerStats(false);
    setIsInterBandPowerStatsUnavailable(false);
    setBandPowerError(null);
    setBandPowerStatsError(null);
  }, []);

  useEffect(() => {
    if (!datasetId || !subjectId || !modelName || lockedPredictionWindowIndex === null) {
      setIsLoadingBandPower(false);
      setBandPower(null);
      setBandPowerError(null);
      return;
    }

    const requestSource = MODEL_INPUT_SOURCE;
    const requestWindowIndex = lockedPredictionWindowIndex;
    const cacheKey = `${modelName}::${datasetId}::${subjectId}::${requestSource}::${requestWindowIndex}`;
    const cachedBandPower = bandPowerCacheRef.current.get(cacheKey);
    if (cachedBandPower) {
      setBandPower(cachedBandPower);
      setBandPowerError(null);
      setIsLoadingBandPower(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingBandPower(true);
    setBandPowerError(null);

    ModelService.computeBandPower(datasetId, subjectId, requestWindowIndex, requestSource, modelName)
      .then((response) => {
        if (!isCurrent) {
          return;
        }

        bandPowerCacheRef.current.set(cacheKey, response);
        setBandPower(response);
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setBandPower(null);
        setBandPowerError(getBandPowerErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingBandPower(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [datasetId, lockedPredictionWindowIndex, modelName, subjectId]);

  useEffect(() => {
    const requestModelName = modelName;
    if (!canLoadBandPowerStats || !requestModelName) {
      setIsLoadingBandPowerStats(false);
      setBandPowerStats([]);
      setBandPowerStatsError(null);
      setIsInterBandPowerStatsUnavailable(false);
      return;
    }

    const requestSource = MODEL_INPUT_SOURCE;
    const requestMode = bandPowerStatsMode;
    const requestCohortLabels =
      requestMode === "inter_patient" && bandPowerStatsCohortLabels.length
        ? bandPowerStatsCohortLabels
        : [null];
    const requests = requestCohortLabels.map((cohortLabel) => {
      const cacheKey = `${requestModelName}::${datasetId}::${subjectId}::${requestSource}::${requestMode}::${cohortLabel ?? "all"}`;
      return { cohortLabel, cacheKey, cached: bandPowerStatsCacheRef.current.get(cacheKey) };
    });
    if (requests.every((request) => request.cached)) {
      setBandPowerStats(requests.map((request) => request.cached as ModelBandPowerStatsResponse));
      setBandPowerStatsError(null);
      setIsLoadingBandPowerStats(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingBandPowerStats(true);
    setBandPowerStatsError(null);

    Promise.all(
      requests.map((request) =>
        request.cached
          ? Promise.resolve(request.cached)
          : ModelService.getBandPowerStats(
              datasetId,
              subjectId,
              requestSource,
              requestMode,
              requestModelName,
              request.cohortLabel,
            ).then((response) => {
              bandPowerStatsCacheRef.current.set(request.cacheKey, response);
              return response;
            }),
      ),
    )
      .then((responses) => {
        if (!isCurrent) {
          return;
        }

        setBandPowerStats(responses);
        if (requestMode === "inter_patient") {
          setIsInterBandPowerStatsUnavailable(false);
        }
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        if (
          requestMode === "inter_patient" &&
          getErrorStatusCode(loadError) === 404 &&
          requestCohortLabels.length === 1 &&
          requestCohortLabels[0] === null
        ) {
          setIsInterBandPowerStatsUnavailable(true);
          setBandPowerStatsMode("intra_patient");
          setBandPowerStatsError(null);
          return;
        }

        setBandPowerStats([]);
        setBandPowerStatsError(getBandPowerErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingBandPowerStats(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [bandPowerStatsCohortLabels, bandPowerStatsMode, canLoadBandPowerStats, datasetId, modelName, subjectId]);

  const updateBandPowerStatsMode = useCallback((mode: ModelBandPowerStatsMode) => {
    setBandPowerStatsMode(mode);
    if (mode !== "inter_patient") {
      setBandPowerStatsCohortLabels([]);
    }
  }, []);

  return {
    bandPower,
    bandPowerStats,
    bandPowerStatsMode,
    bandPowerStatsCohortLabels,
    isInterBandPowerStatsUnavailable,
    isLoadingBandPower,
    isLoadingBandPowerStats,
    bandPowerError,
    bandPowerStatsError,
    setBandPowerStatsMode: updateBandPowerStatsMode,
    setBandPowerStatsCohortLabels,
    clearBandPowerData,
  };
}
