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

export const API_ROUTES = {
  dataset: {
    upload: buildApiUrl("/dataset/upload"),
    getById: (id: string) => buildApiUrl(`/dataset/${id}`),
    deleteById: (id: string) => buildApiUrl(`/dataset/${id}`),
    getAll: buildApiUrl("/dataset/all"),
  },

  clustering: {
    compute: buildApiUrl("/clustering/compute"),
    similarities: buildApiUrl("/clustering/similarities"),
    getByFeatures: buildApiUrl("/clustering/get_by_features"),
    getAllFeaturePairs: buildApiUrl("/clustering/get_all_clustered_feature_pairs"),
    featurePairMatrix: buildApiUrl("/clustering/feature_pair_matrix"),
  },

  shapley: {
    compute: buildApiUrl("/shapley/compute_shap_values"),
    getValues: buildApiUrl("/shapley/get_shapley_values"),
  },

  model: {
    infer: buildApiUrl("/model/infer"),
    attribution: buildApiUrl("/model/attribution"),
    classEvidence: buildApiUrl("/model/class-evidence"),
    bandPower: buildApiUrl("/model/band-power"),
    scalpTopologies: buildApiUrl("/model/scalp-topologies"),
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
