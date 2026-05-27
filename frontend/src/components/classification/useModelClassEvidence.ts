import { useEffect, useState } from "react";

import { ModelService } from "../../services/ModelService";
import type { ModelClassEvidenceResponse, ModelInfoResponse, TimeseriesSource } from "../../types";

interface UseModelClassEvidenceArgs {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  modelInfo: ModelInfoResponse | null;
  windowIndex: number | null;
}

interface UseModelClassEvidenceResult {
  evidence: ModelClassEvidenceResponse | null;
  isLoading: boolean;
  error: string | null;
}

const evidenceCache = new Map<string, ModelClassEvidenceResponse>();
const evidencePromises = new Map<string, Promise<ModelClassEvidenceResponse>>();

export function useModelClassEvidence({
  datasetId,
  subjectId,
  source,
  modelInfo,
  windowIndex,
}: UseModelClassEvidenceArgs): UseModelClassEvidenceResult {
  const modelName = modelInfo?.name;
  const cacheKey =
    datasetId && subjectId && modelName && windowIndex !== null
      ? `${modelName}::${datasetId}::${subjectId}::${source}::${windowIndex}`
      : null;
  const [evidence, setEvidence] = useState<ModelClassEvidenceResponse | null>(() =>
    cacheKey ? (evidenceCache.get(cacheKey) ?? null) : null,
  );
  const [isLoading, setIsLoading] = useState(Boolean(cacheKey) && !evidenceCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId || !subjectId || !modelName || windowIndex === null || !cacheKey) {
      setEvidence(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const cachedEvidence = evidenceCache.get(cacheKey);
    if (cachedEvidence) {
      setEvidence(cachedEvidence);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCurrent = true;
    setEvidence(null);
    setIsLoading(true);
    setError(null);

    const evidencePromise =
      evidencePromises.get(cacheKey) ??
      ModelService.computeClassEvidence(datasetId, subjectId, windowIndex, source, modelName).catch((loadError) => {
        evidencePromises.delete(cacheKey);
        throw loadError;
      });
    evidencePromises.set(cacheKey, evidencePromise);

    evidencePromise
      .then((response) => {
        evidenceCache.set(cacheKey, response);
        if (!isCurrent) {
          return;
        }

        setEvidence(response);
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setEvidence(null);
        setError(getEvidenceErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [cacheKey, datasetId, modelName, source, subjectId, windowIndex]);

  return { evidence, isLoading, error };
}

function getEvidenceErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to load class evidence: ${error.message}`;
  }

  return "Unable to load class evidence.";
}

export type { UseModelClassEvidenceArgs, UseModelClassEvidenceResult };
