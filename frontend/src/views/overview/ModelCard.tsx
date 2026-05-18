import { useState } from "react";

import type {
  ModelInfoResponse,
  ModelMetadataValue,
  ModelPredictionCacheProgress,
  ModelPredictionCacheStatus,
} from "../../types";
import { ModelScalpTopologyPanel } from "../../components";
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
  const [isModelSummaryOpen, setIsModelSummaryOpen] = useState(false);
  const hasModelSummary = Boolean(modelInfo?.model_summary);

  return (
    <section className="overview-placeholder-card overview-model-card">
      <div className="overview-model-card-header">
        <div>
          <p className="overview-kicker">Model card</p>
          <h3>{modelInfo?.display_name ?? "Model unavailable"}</h3>
        </div>
        <div className="overview-model-header-actions">
          {hasModelSummary ? (
            <button
              type="button"
              className="overview-model-module-button"
              title="View PyTorch module"
              aria-label="View PyTorch module"
              aria-expanded={isModelSummaryOpen}
              onClick={() => setIsModelSummaryOpen((isOpen) => !isOpen)}
            >
              Module
            </button>
          ) : null}
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

      <div className="overview-model-operations">
        {modelInfo ? (
          <div className="overview-model-topology">
            <ModelScalpTopologyPanel modelName={modelInfo.name} compact />
          </div>
        ) : null}

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
      </div>

      {isModelSummaryOpen && modelInfo?.model_summary ? (
        <div className="overview-model-summary-overlay" role="dialog" aria-labelledby="overview-model-summary-title">
          <div className="overview-model-summary-header">
            <h4 id="overview-model-summary-title">PyTorch module</h4>
            <button
              type="button"
              className="overview-model-summary-close"
              aria-label="Close PyTorch module"
              onClick={() => setIsModelSummaryOpen(false)}
            >
              Close
            </button>
          </div>
          <pre>{modelInfo.model_summary}</pre>
        </div>
      ) : null}
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
