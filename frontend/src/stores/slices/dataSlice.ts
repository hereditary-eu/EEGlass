import type { StateCreator } from "zustand";

import type { DataState, NeuroPatient } from "../../types";
import type { AppStoreState } from "../useAppStore";

export interface DataSlice {
  dataset: DataState | null;
  patientsData: NeuroPatient[];
  loadings: number[][];
  setDataset: (dataset: DataState | null) => void;
  setPatientsData: (patientsData: NeuroPatient[]) => void;
  setLoadings: (loadings: number[][]) => void;
  clearData: () => void;
}

export const createDataSlice: StateCreator<AppStoreState, [], [], DataSlice> = (set) => ({
  dataset: null,
  patientsData: [],
  loadings: [],
  setDataset: (dataset) => set({ dataset }),
  setPatientsData: (patientsData) => set({ patientsData }),
  setLoadings: (loadings) => set({ loadings }),
  clearData: () =>
    set({
      dataset: null,
      patientsData: [],
      loadings: [],
    }),
});
