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
  const [bandPowerStats, setBandPowerStats] = useState<ModelBandPowerStatsResponse | null>(null);
  const [bandPowerStatsMode, setBandPowerStatsMode] = useState<ModelBandPowerStatsMode>("intra_patient");
  const [bandPowerStatsCohortLabel, setBandPowerStatsCohortLabel] = useState<string | null>(null);
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
    setBandPowerStats(null);
    setBandPowerStatsCohortLabel(null);
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
      setBandPowerStats(null);
      setBandPowerStatsError(null);
      setIsInterBandPowerStatsUnavailable(false);
      return;
    }

    const requestSource = MODEL_INPUT_SOURCE;
    const requestMode = bandPowerStatsMode;
    const requestCohortLabel = requestMode === "inter_patient" ? bandPowerStatsCohortLabel : null;
    const cacheKey = `${requestModelName}::${datasetId}::${subjectId}::${requestSource}::${requestMode}::${requestCohortLabel ?? "all"}`;
    const cachedBandPowerStats = bandPowerStatsCacheRef.current.get(cacheKey);
    if (cachedBandPowerStats) {
      setBandPowerStats(cachedBandPowerStats);
      setBandPowerStatsError(null);
      setIsLoadingBandPowerStats(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingBandPowerStats(true);
    setBandPowerStatsError(null);

    ModelService.getBandPowerStats(
      datasetId,
      subjectId,
      requestSource,
      requestMode,
      requestModelName,
      requestCohortLabel,
    )
      .then((response) => {
        if (!isCurrent) {
          return;
        }

        bandPowerStatsCacheRef.current.set(cacheKey, response);
        setBandPowerStats(response);
        if (response.mode === "inter_patient") {
          setIsInterBandPowerStatsUnavailable(false);
        }
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        if (requestMode === "inter_patient" && getErrorStatusCode(loadError) === 404 && !requestCohortLabel) {
          setIsInterBandPowerStatsUnavailable(true);
          setBandPowerStatsMode("intra_patient");
          setBandPowerStatsError(null);
          return;
        }

        setBandPowerStats(null);
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
  }, [bandPowerStatsCohortLabel, bandPowerStatsMode, canLoadBandPowerStats, datasetId, modelName, subjectId]);

  const updateBandPowerStatsMode = useCallback((mode: ModelBandPowerStatsMode) => {
    setBandPowerStatsMode(mode);
    if (mode !== "inter_patient") {
      setBandPowerStatsCohortLabel(null);
    }
  }, []);

  return {
    bandPower,
    bandPowerStats,
    bandPowerStatsMode,
    bandPowerStatsCohortLabel,
    isInterBandPowerStatsUnavailable,
    isLoadingBandPower,
    isLoadingBandPowerStats,
    bandPowerError,
    bandPowerStatsError,
    setBandPowerStatsMode: updateBandPowerStatsMode,
    setBandPowerStatsCohortLabel,
    clearBandPowerData,
  };
}
