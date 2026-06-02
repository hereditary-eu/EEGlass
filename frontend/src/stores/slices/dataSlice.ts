import type { StateCreator } from "zustand";

import type { DataState } from "../../types";
import type { AppStoreState } from "../useAppStore";

export interface DataSlice {
  dataset: DataState | null;
  setDataset: (dataset: DataState | null) => void;
  clearData: () => void;
}

export const createDataSlice: StateCreator<AppStoreState, [], [], DataSlice> = (set) => ({
  dataset: null,
  setDataset: (dataset) => set({ dataset }),
  clearData: () =>
    set({
      dataset: null,
    }),
});
