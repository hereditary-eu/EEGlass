import type { StateCreator } from "zustand";

import type { ChannelId, TimeRange, TimeseriesBandFilter } from "../../types";
import type { AppStoreState } from "../useAppStore";

export interface TimeseriesSlice {
  selectedChannels: ChannelId[];
  selectedTimeseriesBandFilter: TimeseriesBandFilter | null;
  selectedTimeRange: TimeRange | null;
  setSelectedChannels: (channels: ChannelId[]) => void;
  setSelectedTimeseriesBandFilter: (bandFilter: TimeseriesBandFilter | null) => void;
  setSelectedTimeRange: (timeRange: TimeRange | null) => void;
}

export const createTimeseriesSlice: StateCreator<AppStoreState, [], [], TimeseriesSlice> = (set) => ({
  selectedChannels: [],
  selectedTimeseriesBandFilter: null,
  selectedTimeRange: null,
  setSelectedChannels: (selectedChannels) => set({ selectedChannels }),
  setSelectedTimeseriesBandFilter: (selectedTimeseriesBandFilter) => set({ selectedTimeseriesBandFilter }),
  setSelectedTimeRange: (selectedTimeRange) => set({ selectedTimeRange }),
});
