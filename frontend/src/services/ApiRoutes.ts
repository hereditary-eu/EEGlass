declare global {
  interface Window {
    __ALL_IN_ON_EEG_CONFIG__?: {
      apiBaseUrl?: string;
    };
  }
}

const API_BASE_URL = getApiBaseUrl();

function getApiBaseUrl(): string {
  const configuredBaseUrl = process.env.BUN_PUBLIC_API_BASE_URL!;
  return configuredBaseUrl.replace(/\/$/, "");
}

function buildApiUrl(path: string): string {
  if (!API_BASE_URL || API_BASE_URL === ".") {
    return path.startsWith("/") ? path : `/${path}`;
  }
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildWebSocketUrl(path: string): string {
  const apiUrl = new URL(buildApiUrl(path), getBrowserOrigin());
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  return apiUrl.toString();
}

function getBrowserOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost:8000";
}

export const API_ROUTES = {
  settings: {
    patientAggregation: buildApiUrl("/settings/patient-aggregation"),
  },

  model: {
    list: buildApiUrl("/models"),
    current: buildApiUrl("/models/current"),
    defaultInfo: buildApiUrl("/models/default"),
    info: (modelName: string) => buildApiUrl(`/models/${encodeURIComponent(modelName)}`),
    infer: (modelName: string) => buildApiUrl(`/models/${encodeURIComponent(modelName)}/infer`),
    classEvidence: (modelName: string) => buildApiUrl(`/models/${encodeURIComponent(modelName)}/class-evidence`),
    classWeights: (modelName: string) => buildApiUrl(`/models/${encodeURIComponent(modelName)}/class-weights`),
    bandPower: (modelName: string) => buildApiUrl(`/models/${encodeURIComponent(modelName)}/band-power`),
    bandPowerStats: (datasetId: string, subjectId: string, modelName: string) =>
      buildApiUrl(
        `/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/band-power-stats`,
      ),
    scalpTopologies: (modelName: string) => buildApiUrl(`/models/${encodeURIComponent(modelName)}/scalp-topologies`),
    startPredictionCacheJob: (datasetId: string, modelName: string) =>
      buildApiUrl(
        `/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/prediction-cache/jobs`,
      ),
    activePredictionCacheJob: (datasetId: string, modelName: string) =>
      buildApiUrl(
        `/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/prediction-cache/jobs/active`,
      ),
    predictionCacheStatus: (datasetId: string, modelName: string) =>
      buildApiUrl(
        `/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/prediction-cache`,
      ),
    patientEmbeddings: (datasetId: string, modelName: string) =>
      buildApiUrl(
        `/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/patient-embeddings`,
      ),
    windowEmbeddings: (datasetId: string, subjectId: string, modelName: string) =>
      buildApiUrl(
        `/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/window-embeddings`,
      ),
    windowScalpTopologies: (datasetId: string, subjectId: string, modelName: string) =>
      buildApiUrl(
        `/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/window-scalp-topologies`,
      ),
    subjectPredictions: (datasetId: string, subjectId: string, modelName: string) =>
      buildApiUrl(
        `/models/${encodeURIComponent(modelName)}/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/predictions`,
      ),
    predictionCacheProgressSocket: (jobId: string, modelName: string) =>
      buildWebSocketUrl(
        `/models/${encodeURIComponent(modelName)}/prediction-cache/jobs/${encodeURIComponent(jobId)}/progress`,
      ),
  },

  timeseries: {
    datasets: buildApiUrl("/data/datasets"),
    subjects: (datasetId: string) => buildApiUrl(`/data/datasets/${encodeURIComponent(datasetId)}/subjects`),
    metadata: (datasetId: string, subjectId: string) =>
      buildApiUrl(`/data/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/metadata`),
    preview: (datasetId: string, subjectId: string) =>
      buildApiUrl(`/data/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/preview`),
    signal: (datasetId: string, subjectId: string) =>
      buildApiUrl(
        `/data/datasets/${encodeURIComponent(datasetId)}/subjects/${encodeURIComponent(subjectId)}/timeseries-signal`,
      ),
  },
};
