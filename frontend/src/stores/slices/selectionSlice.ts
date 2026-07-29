import type { StateCreator } from "zustand";

import type { EmbeddingReductionMethod, FeatureId, FeaturePair } from "../../types";
import type { AppStoreState } from "../useAppStore";

export interface SelectionSlice {
  selectedFeaturePair: FeaturePair;
  selectedCategoricalFeature: FeatureId;
  selectedCluster: number | null;
  selectedEmbeddingReductionMethod: EmbeddingReductionMethod;
  scatterK: number;
  pcaK: number;
  biplotFeatures: FeatureId[];
  selectedCovariateFeatures: FeatureId[];
  setSelectedFeaturePair: (featurePair: FeaturePair) => void;
  setSelectedCategoricalFeature: (feature: FeatureId) => void;
  setSelectedCluster: (cluster: number | null) => void;
  setSelectedEmbeddingReductionMethod: (method: EmbeddingReductionMethod) => void;
  setScatterK: (k: number) => void;
  setPcaK: (k: number) => void;
  setBiplotFeatures: (features: FeatureId[]) => void;
  setSelectedCovariateFeatures: (features: FeatureId[]) => void;
}

export const createSelectionSlice: StateCreator<AppStoreState, [], [], SelectionSlice> = (set) => ({
  selectedFeaturePair: ["insnpsi_age", "visuosp_z_comp"],
  selectedCategoricalFeature: "None",
  selectedCluster: null,
  selectedEmbeddingReductionMethod: "pca",
  scatterK: 3,
  pcaK: 3,
  biplotFeatures: ["insnpsi_age", "visuosp_z_comp", "memory_z_comp"],
  selectedCovariateFeatures: ["insnpsi_age", "npsid_rep_mmse_c", "memory_z_comp"],
  setSelectedFeaturePair: (selectedFeaturePair) => set({ selectedFeaturePair }),
  setSelectedCategoricalFeature: (selectedCategoricalFeature) => set({ selectedCategoricalFeature }),
  setSelectedCluster: (selectedCluster) => set({ selectedCluster }),
  setSelectedEmbeddingReductionMethod: (selectedEmbeddingReductionMethod) => set({ selectedEmbeddingReductionMethod }),
  setScatterK: (scatterK) => set({ scatterK }),
  setPcaK: (pcaK) => set({ pcaK }),
  setBiplotFeatures: (biplotFeatures) => set({ biplotFeatures }),
  setSelectedCovariateFeatures: (selectedCovariateFeatures) => set({ selectedCovariateFeatures }),
});
