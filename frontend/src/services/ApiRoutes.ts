import { DEFAULT_MODEL_NAME } from "../constants/eegModel";

export { DEFAULT_MODEL_NAME } from "../constants/eegModel";

declare global {
  interface Window {
    __ALL_IN_ON_EEG_CONFIG__?: {
      apiBaseUrl?: string;
    };
  }
}

const API_BASE_URL = getApiBaseUrl();

function getApiBaseUrl(): string {
  const configuredBaseUrl =
    (typeof window !== "undefined" ? window.__ALL_IN_ON_EEG_CONFIG__?.apiBaseUrl : undefined) ??
    getProcessEnvValue("BUN_PUBLIC_API_BASE_URL") ??
    "http://localhost:8000";

  return configuredBaseUrl.replace(/\/$/, "");
}

function getProcessEnvValue(key: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };

  return runtime.process?.env?.[key];
}

function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildWebSocketUrl(path: string): string {
  const apiUrl = new URL(buildApiUrl(path));
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  return apiUrl.toString();
}

export const API_ROUTES = {
  model: {
    info: (modelName: string = DEFAULT_MODEL_NAME) => buildApiUrl(`/models/${encodeURIComponent(modelName)}`),
    infer: (modelName: string = DEFAULT_MODEL_NAME) => buildApiUrl(`/models/${encodeURIComponent(modelName)}/infer`),
    classEvidence: (modelName: string = DEFAULT_MODEL_NAME) =>
      buildApiUrl(`/models/${encodeURIComponent(modelName)}/class-evidence`),
    bandPower: (modelName: string = DEFAULT_MODEL_NAME) =>
      buildApiUrl(`/models/${encodeURIComponent(modelName)}/band-power`),
    scalpTopologies: (modelName: string = DEFAULT_MODEL_NAME) =>
      buildApiUrl(`/models/${encodeURIComponent(modelName)}/scalp-topologies`),
    startPredictionCacheJob: (datasetId: string, modelName: string = DEFAULT_MODEL_NAME) =>
      buildApiUrl(`/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/prediction-cache/jobs`),
    predictionCacheStatus: (datasetId: string, modelName: string = DEFAULT_MODEL_NAME) =>
      buildApiUrl(`/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/prediction-cache`),
    patientEmbeddings: (datasetId: string, modelName: string = DEFAULT_MODEL_NAME) =>
      buildApiUrl(`/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/patient-embeddings`),
    subjectPredictions: (datasetId: string, subjectId: string, modelName: string = DEFAULT_MODEL_NAME) =>
      buildApiUrl(
        `/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/predictions`,
      ),
    predictionCacheProgressSocket: (jobId: string, modelName: string = DEFAULT_MODEL_NAME) =>
      buildWebSocketUrl(`/models/${encodeURIComponent(modelName)}/prediction-cache/jobs/${encodeURIComponent(jobId)}/progress`),
  },

  timeseries: {
    datasets: buildApiUrl("/timeseries/datasets"),
    subjects: (datasetId: string) => buildApiUrl(`/timeseries/datasets/${encodeURIComponent(datasetId)}/subjects`),
    metadata: (datasetId: string, subjectId: string) =>
      buildApiUrl(
        `/timeseries/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/metadata`,
      ),
    preview: (datasetId: string, subjectId: string) =>
      buildApiUrl(
        `/timeseries/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/preview`,
      ),
    signal: (datasetId: string, subjectId: string) =>
      buildApiUrl(
        `/timeseries/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/signal`,
      ),
  },
};
