import { useEffect, useState } from "react";

import { ComponentStatusIndicator } from "../../components";
import type { ComponentStatus } from "../../components/ui";
import type {
  ModelInfoResponse,
  ModelListItem,
  ModelMetadataValue,
  PatientAggregationSettingsPayload,
  ModelPredictionCacheProgress,
  ModelPredictionCacheStatus,
  PatientAggregationSettings,
  PatientAggregationThresholdField,
} from "../../types";
import { ModelScalpTopologyPanel } from "../../components";
import { PredictionCacheProgressBar } from "./PredictionCacheProgressBar";
import { ModelClassWeightsMatrix } from "./ModelClassWeightsMatrix";
import { getCacheSummary, isCacheJobRunning } from "./overviewUtils";

interface ModelCardProps {
  modelInfo: ModelInfoResponse | null;
  modelInfoError: string | null;
  availableModels: ModelListItem[];
  isLoadingModels: boolean;
  isSwitchingModel: boolean;
  selectedDatasetId: string;
  cacheStatus: ModelPredictionCacheStatus | null;
  cacheProgress: ModelPredictionCacheProgress | null;
  cacheError: string | null;
  patientAggregationSettings: PatientAggregationSettings | null;
  patientAggregationSettingsError: string | null;
  isLoadingPatientAggregationSettings: boolean;
  isSavingPatientAggregationSettings: boolean;
  isStartingCacheJob: boolean;
  isDeletingCache: boolean;
  onModelChange: (modelName: string) => void;
  onSavePatientAggregationSettings: (settings: PatientAggregationSettingsPayload) => Promise<void>;
  onStartPredictionCacheJob: () => void;
  onDeletePredictionCache: () => void;
}

const EMPTY_PATIENT_AGGREGATION_SETTINGS: PatientAggregationSettingsPayload = {
  strategy: "disease_threshold",
  alzheimer_threshold: 0,
  frontotemporal_dementia_threshold: 0,
};

export function ModelCard({
  modelInfo,
  modelInfoError,
  availableModels,
  isLoadingModels,
  isSwitchingModel,
  selectedDatasetId,
  cacheStatus,
  cacheProgress,
  cacheError,
  patientAggregationSettings,
  patientAggregationSettingsError,
  isLoadingPatientAggregationSettings,
  isSavingPatientAggregationSettings,
  isStartingCacheJob,
  isDeletingCache,
  onModelChange,
  onSavePatientAggregationSettings,
  onStartPredictionCacheJob,
  onDeletePredictionCache,
}: ModelCardProps) {
  const metadataEntries = Object.entries(modelInfo?.metadata ?? {});
  const [isModelSummaryOpen, setIsModelSummaryOpen] = useState(false);
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);
  const [draftAggregationSettings, setDraftAggregationSettings] = useState<PatientAggregationSettingsPayload>(
    () => toPatientAggregationSettingsPayload(patientAggregationSettings ?? EMPTY_PATIENT_AGGREGATION_SETTINGS),
  );
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const hasModelSummary = Boolean(modelInfo?.model_summary);
  const isCacheRunning = isCacheJobRunning(cacheProgress);
  const modelStatus = getModelCardStatus({
    modelInfo,
    modelInfoError,
    isLoadingModels,
    isSwitchingModel,
  });
  const settingsStatusText = isLoadingPatientAggregationSettings
    ? "Loading patient aggregation settings."
    : patientAggregationSettingsError
      ? patientAggregationSettingsError
      : "Saved app-wide aggregation settings are applied to cached patient summaries.";

  useEffect(() => {
    if (isModelConfigOpen) {
      setDraftAggregationSettings(
        toPatientAggregationSettingsPayload(patientAggregationSettings ?? EMPTY_PATIENT_AGGREGATION_SETTINGS),
      );
      setSettingsSaveError(null);
    }
  }, [isModelConfigOpen, patientAggregationSettings]);

  const updateDraftThreshold = (field: PatientAggregationThresholdField, value: string) => {
    setDraftAggregationSettings((currentSettings) => ({
      ...currentSettings,
      [field]: clampThreshold(Number(value)),
    }));
  };

  const saveDraftAggregationSettings = async (settings: PatientAggregationSettingsPayload) => {
    setSettingsSaveError(null);
    try {
      await onSavePatientAggregationSettings(settings);
      setIsModelConfigOpen(false);
    } catch (error) {
      setSettingsSaveError(error instanceof Error ? error.message : "Unable to save patient aggregation settings.");
    }
  };

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
            title="Model settings"
            aria-label="Open model settings"
            aria-expanded={isModelConfigOpen}
            onClick={() => setIsModelConfigOpen((isOpen) => !isOpen)}
          >
            {"\u2699"}
          </button>
          {isModelConfigOpen ? (
            <div className="overview-model-settings-overlay" role="dialog" aria-label="Model settings">
              <div className="overview-model-settings-header">
                <div>
                  <h4>Model settings</h4>
                  <span>Pretrained model and app-wide patient aggregation</span>
                </div>
                <button
                  type="button"
                  className="overview-model-settings-close"
                  aria-label="Close model settings"
                  onClick={() => setIsModelConfigOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="overview-model-settings-section">
                <div className="overview-model-settings-section-heading">
                  <h5>Pretrained model</h5>
                  <span>{modelInfo?.architecture ?? "No model loaded."}</span>
                </div>
                <select
                  id="overview-model-select"
                  value={modelInfo?.name ?? ""}
                  disabled={!availableModels.length || isLoadingModels || isSwitchingModel || isCacheRunning}
                  onChange={(event) => {
                    onModelChange(event.currentTarget.value);
                    setIsModelConfigOpen(false);
                  }}
                >
                  {availableModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.display_name}
                    </option>
                  ))}
                </select>
                <p>
                  {isCacheRunning
                    ? "Model switching is disabled while prediction cache is running."
                    : "Switching model clears overview model outputs and reloads cache state."}
                </p>
              </div>

              <div className="overview-model-settings-section">
                <div className="overview-model-settings-section-heading">
                  <h5>Patient aggregation</h5>
                  <span>Disease window thresholds</span>
                </div>
                <div className="overview-model-threshold-grid">
                  {(patientAggregationSettings?.thresholds ?? []).map((threshold) => (
                    <label key={threshold.field}>
                      <span>{threshold.class_label}</span>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={formatThresholdInput(draftAggregationSettings[threshold.field])}
                        disabled={isLoadingPatientAggregationSettings || isSavingPatientAggregationSettings}
                        onChange={(event) => updateDraftThreshold(threshold.field, event.currentTarget.value)}
                      />
                    </label>
                  ))}
                </div>
                <p>{settingsSaveError ?? settingsStatusText}</p>
                <div className="overview-model-settings-actions">
                  <button
                    type="button"
                    className="overview-model-reset-button"
                    disabled={
                      isLoadingPatientAggregationSettings || isSavingPatientAggregationSettings || !patientAggregationSettings
                    }
                    onClick={() =>
                      void saveDraftAggregationSettings(
                        patientAggregationSettings?.defaults ?? EMPTY_PATIENT_AGGREGATION_SETTINGS,
                      )
                    }
                  >
                    Reset defaults
                  </button>
                  <button
                    type="button"
                    className="overview-model-save-button"
                    disabled={
                      isLoadingPatientAggregationSettings || isSavingPatientAggregationSettings || !patientAggregationSettings
                    }
                    onClick={() => void saveDraftAggregationSettings(draftAggregationSettings)}
                  >
                    {isSavingPatientAggregationSettings ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <ComponentStatusIndicator status={modelStatus.status} label={modelStatus.label} />
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
          <>
            <div className="overview-model-topology">
              <ModelScalpTopologyPanel modelName={modelInfo.name} compact />
            </div>
            <ModelClassWeightsMatrix modelInfo={modelInfo} />
          </>
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
                disabled={!modelInfo || !selectedDatasetId || isStartingCacheJob || isCacheRunning}
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
                  isCacheRunning ||
                  cacheStatus?.status === "missing"
                }
              >
                Delete
              </button>
            </div>
          </div>
          {cacheProgress && isCacheJobRunning(cacheProgress) ? (
            <PredictionCacheProgressBar progress={cacheProgress} />
          ) : null}
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

function getModelCardStatus({
  modelInfo,
  modelInfoError,
  isLoadingModels,
  isSwitchingModel,
}: {
  modelInfo: ModelInfoResponse | null;
  modelInfoError: string | null;
  isLoadingModels: boolean;
  isSwitchingModel: boolean;
}): { status: ComponentStatus; label: string } {
  if (modelInfoError) {
    return { status: "error", label: modelInfoError };
  }

  if (isLoadingModels || isSwitchingModel) {
    return { status: "loading", label: isSwitchingModel ? "Switching model" : "Loading model" };
  }

  if (modelInfo) {
    return { status: "loaded", label: "Model loaded" };
  }

  return { status: "idle", label: "Model unavailable" };
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

function toPatientAggregationSettingsPayload(
  settings: PatientAggregationSettings | PatientAggregationSettingsPayload,
): PatientAggregationSettingsPayload {
  return {
    strategy: settings.strategy,
    alzheimer_threshold: settings.alzheimer_threshold,
    frontotemporal_dementia_threshold: settings.frontotemporal_dementia_threshold,
  };
}

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function formatThresholdInput(value: number): string {
  return clampThreshold(value).toFixed(2);
}
