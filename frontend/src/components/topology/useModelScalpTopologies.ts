import { useEffect, useState } from "react";

import { TimeseriesService } from "../../services/TimeseriesService";
import type { ModelScalpTopologyResponse } from "../../types";
import { getScalpTopologyErrorMessage } from "./scalpTopologyUtils";

interface UseModelScalpTopologiesResult {
  scalpTopologies: ModelScalpTopologyResponse | null;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_MODEL_CACHE_KEY = "__default__";
const scalpTopologyCache = new Map<string, ModelScalpTopologyResponse>();
const scalpTopologyPromises = new Map<string, Promise<ModelScalpTopologyResponse>>();

export function useModelScalpTopologies(modelName?: string | null): UseModelScalpTopologiesResult {
  const cacheKey = modelName ?? DEFAULT_MODEL_CACHE_KEY;
  const [scalpTopologies, setScalpTopologies] = useState<ModelScalpTopologyResponse | null>(
    () => scalpTopologyCache.get(cacheKey) ?? null,
  );
  const [isLoading, setIsLoading] = useState(!scalpTopologyCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const cachedTopologies = scalpTopologyCache.get(cacheKey);
    if (cachedTopologies) {
      setScalpTopologies(cachedTopologies);
      setIsLoading(false);
      setError(null);
      return;
    }

    setScalpTopologies(null);
    setIsLoading(true);
    setError(null);

    const topologyPromise =
      scalpTopologyPromises.get(cacheKey) ??
      TimeseriesService.getScalpTopologies(modelName ?? undefined).catch((loadError) => {
        scalpTopologyPromises.delete(cacheKey);
        throw loadError;
      });
    scalpTopologyPromises.set(cacheKey, topologyPromise);

    topologyPromise
      .then((response) => {
        scalpTopologyCache.set(cacheKey, response);
        if (!isCurrent) {
          return;
        }

        setScalpTopologies(response);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setScalpTopologies(null);
        setIsLoading(false);
        setError(getScalpTopologyErrorMessage(loadError));
      });

    return () => {
      isCurrent = false;
    };
  }, [cacheKey, modelName]);

  return { scalpTopologies, isLoading, error };
}
