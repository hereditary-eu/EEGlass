import { useCallback, useEffect, useRef, useState } from "react";

import { TimeseriesService } from "../../services/TimeseriesService";
import type {
  ModelBandPowerResponse,
  ModelBandPowerStatsMode,
  ModelBandPowerStatsResponse,
  TimeseriesSource,
} from "../../types";
import { getBandPowerErrorMessage, getErrorStatusCode } from "./shared";

interface UseTimeseriesBandPowerOptions {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  lockedPredictionWindowIndex: number | null;
}

export function useTimeseriesBandPower({
  datasetId,
  subjectId,
  source,
  lockedPredictionWindowIndex,
}: UseTimeseriesBandPowerOptions) {
  const [bandPower, setBandPower] = useState<ModelBandPowerResponse | null>(null);
  const [bandPowerStats, setBandPowerStats] = useState<ModelBandPowerStatsResponse | null>(null);
  const [bandPowerStatsMode, setBandPowerStatsMode] = useState<ModelBandPowerStatsMode>("intra_patient");
  const [isLoadingBandPower, setIsLoadingBandPower] = useState(false);
  const [isLoadingBandPowerStats, setIsLoadingBandPowerStats] = useState(false);
  const [isInterBandPowerStatsUnavailable, setIsInterBandPowerStatsUnavailable] = useState(false);
  const [bandPowerError, setBandPowerError] = useState<string | null>(null);
  const [bandPowerStatsError, setBandPowerStatsError] = useState<string | null>(null);
  const bandPowerCacheRef = useRef(new Map<string, ModelBandPowerResponse>());
  const bandPowerStatsCacheRef = useRef(new Map<string, ModelBandPowerStatsResponse>());
  const canLoadBandPowerStats = Boolean(datasetId && subjectId && lockedPredictionWindowIndex !== null);

  const clearBandPowerData = useCallback(() => {
    bandPowerCacheRef.current.clear();
    bandPowerStatsCacheRef.current.clear();
    setBandPower(null);
    setBandPowerStats(null);
    setIsLoadingBandPower(false);
    setIsLoadingBandPowerStats(false);
    setIsInterBandPowerStatsUnavailable(false);
    setBandPowerError(null);
    setBandPowerStatsError(null);
  }, []);

  useEffect(() => {
    if (!datasetId || !subjectId || lockedPredictionWindowIndex === null) {
      setIsLoadingBandPower(false);
      setBandPower(null);
      setBandPowerError(null);
      return;
    }

    const requestSource = source;
    const requestWindowIndex = lockedPredictionWindowIndex;
    const cacheKey = `${datasetId}::${subjectId}::${requestSource}::${requestWindowIndex}`;
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

    TimeseriesService.computeBandPower(datasetId, subjectId, requestWindowIndex, requestSource)
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
  }, [datasetId, lockedPredictionWindowIndex, source, subjectId]);

  useEffect(() => {
    if (!canLoadBandPowerStats) {
      setIsLoadingBandPowerStats(false);
      setBandPowerStats(null);
      setBandPowerStatsError(null);
      setIsInterBandPowerStatsUnavailable(false);
      return;
    }

    const requestSource = source;
    const requestMode = bandPowerStatsMode;
    const cacheKey = `${datasetId}::${subjectId}::${requestSource}::${requestMode}`;
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

    TimeseriesService.getBandPowerStats(datasetId, subjectId, requestSource, requestMode)
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

        if (requestMode === "inter_patient" && getErrorStatusCode(loadError) === 404) {
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
  }, [bandPowerStatsMode, canLoadBandPowerStats, datasetId, source, subjectId]);

  return {
    bandPower,
    bandPowerStats,
    bandPowerStatsMode,
    isInterBandPowerStatsUnavailable,
    isLoadingBandPower,
    isLoadingBandPowerStats,
    bandPowerError,
    bandPowerStatsError,
    setBandPowerStatsMode,
    clearBandPowerData,
  };
}
