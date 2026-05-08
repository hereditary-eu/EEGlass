import type {
  ModelInfoResponse,
  ModelMetadataValue,
  ModelPredictionCacheProgress,
  ModelPredictionCacheStatus,
} from "../../types";
import { PredictionCacheProgressBar } from "./PredictionCacheProgressBar";
import { getCacheSummary, isCacheJobRunning } from "./overviewUtils";

interface ModelCardProps {
  modelInfo: ModelInfoResponse | null;
  modelInfoError: string | null;
  selectedDatasetId: string;
  cacheStatus: ModelPredictionCacheStatus | null;
  cacheProgress: ModelPredictionCacheProgress | null;
  cacheError: string | null;
  isStartingCacheJob: boolean;
  isDeletingCache: boolean;
  onStartPredictionCacheJob: () => void;
  onDeletePredictionCache: () => void;
}

export function ModelCard({
  modelInfo,
  modelInfoError,
  selectedDatasetId,
  cacheStatus,
  cacheProgress,
  cacheError,
  isStartingCacheJob,
  isDeletingCache,
  onStartPredictionCacheJob,
  onDeletePredictionCache,
}: ModelCardProps) {
  const metadataEntries = Object.entries(modelInfo?.metadata ?? {});

  return (
    <section className="overview-placeholder-card overview-model-card">
      <div className="overview-model-card-header">
        <div>
          <p className="overview-kicker">Model card</p>
          <h3>{modelInfo?.display_name ?? "Model unavailable"}</h3>
        </div>
        <button
          type="button"
          className="overview-model-config-button"
          title="Model settings and metadata panel"
          aria-label="Open model settings and metadata panel"
          disabled={true}
        >
          {"\u2699"}
        </button>
      </div>

      <dl className="overview-model-details">
        {metadataEntries.map(([label, value]) => {
          const formattedValue = formatModelMetadataValue(value);

          return (
            <div key={label}>
              <dt title={label}>{label}</dt>
              <dd title={formattedValue}>{formattedValue}</dd>
            </div>
          );
        })}
      </dl>
      {modelInfoError ? <p className="overview-model-cache-error">{modelInfoError}</p> : null}

      <div className="overview-model-cache">
        <div className="overview-model-cache-toolbar">
          <div>
            <p className="overview-model-cache-label">Prediction cache</p>
            <span>{getCacheSummary(cacheStatus, cacheProgress)}</span>
          </div>
          <div className="overview-model-cache-actions">
            <button
              type="button"
              className="overview-model-compute-button"
              onClick={onStartPredictionCacheJob}
              disabled={!modelInfo || !selectedDatasetId || isStartingCacheJob || isCacheJobRunning(cacheProgress)}
            >
              Compute all
            </button>
            <button
              type="button"
              className="overview-model-delete-button"
              onClick={onDeletePredictionCache}
              disabled={
                !selectedDatasetId ||
                !modelInfo ||
                isDeletingCache ||
                isCacheJobRunning(cacheProgress) ||
                cacheStatus?.status === "missing"
              }
            >
              Delete
            </button>
          </div>
        </div>
        {isCacheJobRunning(cacheProgress) ? <PredictionCacheProgressBar progress={cacheProgress} /> : null}
        {cacheError ? <p className="overview-model-cache-error">{cacheError}</p> : null}
      </div>
    </section>
  );
}

function formatModelMetadataValue(value: ModelMetadataValue): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}
