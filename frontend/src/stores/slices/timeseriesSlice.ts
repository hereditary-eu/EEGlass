import type { StateCreator } from "zustand";

import type { ChannelId, TimeRange, TimeseriesBandFilter, TimeseriesSource } from "../../types";
import type { AppStoreState } from "../useAppStore";

export interface TimeseriesSlice {
  selectedChannels: ChannelId[];
  selectedTimeseriesSource: TimeseriesSource;
  selectedScalpBand: TimeseriesBandFilter;
  selectedTimeseriesBandFilter: TimeseriesBandFilter | null;
  selectedTimeRange: TimeRange | null;
  hoveredPredictionWindowIndex: number | null;
  lockedPredictionWindowIndex: number | null;
  setSelectedChannels: (channels: ChannelId[]) => void;
  selectSingleTimeseriesChannel: (channel: ChannelId) => void;
  setSelectedTimeseriesSource: (source: TimeseriesSource) => void;
  setSelectedScalpBand: (band: TimeseriesBandFilter) => void;
  setSelectedTimeseriesBandFilter: (bandFilter: TimeseriesBandFilter | null) => void;
  setSelectedTimeRange: (timeRange: TimeRange | null) => void;
  setHoveredPredictionWindowIndex: (windowIndex: number | null) => void;
  setLockedPredictionWindowIndex: (windowIndex: number | null) => void;
  clearSelectedPredictionWindow: () => void;
}

export const createTimeseriesSlice: StateCreator<AppStoreState, [], [], TimeseriesSlice> = (set) => ({
  selectedChannels: [],
  selectedTimeseriesSource: "derivatives",
  selectedScalpBand: "alpha",
  selectedTimeseriesBandFilter: null,
  selectedTimeRange: null,
  hoveredPredictionWindowIndex: null,
  lockedPredictionWindowIndex: null,
  setSelectedChannels: (selectedChannels) => set({ selectedChannels }),
  selectSingleTimeseriesChannel: (channel) => set({ selectedChannels: [channel], selectedTimeRange: null }),
  setSelectedTimeseriesSource: (selectedTimeseriesSource) => set({ selectedTimeseriesSource }),
  setSelectedScalpBand: (selectedScalpBand) => set({ selectedScalpBand }),
  setSelectedTimeseriesBandFilter: (selectedTimeseriesBandFilter) => set({ selectedTimeseriesBandFilter }),
  setSelectedTimeRange: (selectedTimeRange) => set({ selectedTimeRange }),
  setHoveredPredictionWindowIndex: (hoveredPredictionWindowIndex) => set({ hoveredPredictionWindowIndex }),
  setLockedPredictionWindowIndex: (lockedPredictionWindowIndex) => set({ lockedPredictionWindowIndex }),
  clearSelectedPredictionWindow: () => set({ hoveredPredictionWindowIndex: null, lockedPredictionWindowIndex: null }),
});
