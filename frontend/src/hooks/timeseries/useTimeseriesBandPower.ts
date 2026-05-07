import { useCallback, useEffect, useRef, useState } from "react";

import { TimeseriesService } from "../../services/TimeseriesService";
import type { ModelBandPowerResponse, TimeseriesSource } from "../../types";
import { getBandPowerErrorMessage } from "./shared";

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
  const [isLoadingBandPower, setIsLoadingBandPower] = useState(false);
  const [bandPowerError, setBandPowerError] = useState<string | null>(null);
  const bandPowerCacheRef = useRef(new Map<string, ModelBandPowerResponse>());

  const clearBandPowerData = useCallback(() => {
    bandPowerCacheRef.current.clear();
    setBandPower(null);
    setIsLoadingBandPower(false);
    setBandPowerError(null);
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

  return {
    bandPower,
    isLoadingBandPower,
    bandPowerError,
    clearBandPowerData,
  };
}
