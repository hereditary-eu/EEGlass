import type { StateCreator } from "zustand";

import type { FeatureId, TableViewMode } from "../../types";
import type { AppStoreState } from "../useAppStore";

export interface TableSlice {
  tableViewMode: TableViewMode;
  hiddenColumns: FeatureId[];
  isTableExpanded: boolean;
  setTableViewMode: (viewMode: TableViewMode) => void;
  setHiddenColumns: (columns: FeatureId[]) => void;
  hideTableColumn: (column: FeatureId) => void;
  restoreTableColumn: (column: FeatureId) => void;
  setIsTableExpanded: (isExpanded: boolean) => void;
}

export const createTableSlice: StateCreator<AppStoreState, [], [], TableSlice> = (set) => ({
  tableViewMode: "numerical",
  hiddenColumns: [],
  isTableExpanded: true,
  setTableViewMode: (tableViewMode) => set({ tableViewMode }),
  setHiddenColumns: (hiddenColumns) => set({ hiddenColumns }),
  hideTableColumn: (column) =>
    set((state) => ({
      hiddenColumns: state.hiddenColumns.includes(column) ? state.hiddenColumns : [...state.hiddenColumns, column],
    })),
  restoreTableColumn: (column) =>
    set((state) => ({
      hiddenColumns: state.hiddenColumns.filter((hiddenColumn) => hiddenColumn !== column),
    })),
  setIsTableExpanded: (isTableExpanded) => set({ isTableExpanded }),
});
