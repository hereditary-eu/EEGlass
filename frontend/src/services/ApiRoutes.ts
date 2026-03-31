const API_BASE_URL = (process.env.BUN_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

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
};
