import { create } from "zustand";

import { createDataSlice, type DataSlice } from "./slices/dataSlice";
import { createSelectionSlice, type SelectionSlice } from "./slices/selectionSlice";
import { createTableSlice, type TableSlice } from "./slices/tableSlice";
import { createTimeseriesSlice, type TimeseriesSlice } from "./slices/timeseriesSlice";

export type AppStoreState = DataSlice & SelectionSlice & TableSlice & TimeseriesSlice;

export const useAppStore = create<AppStoreState>()((...storeApi) => ({
  ...createDataSlice(...storeApi),
  ...createSelectionSlice(...storeApi),
  ...createTableSlice(...storeApi),
  ...createTimeseriesSlice(...storeApi),
}));
