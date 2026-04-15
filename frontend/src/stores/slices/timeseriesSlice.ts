import type { StateCreator } from "zustand";

import type { ChannelId, TimeRange } from "../../types";
import type { AppStoreState } from "../useAppStore";

export interface TimeseriesSlice {
  selectedChannels: ChannelId[];
  selectedTimeRange: TimeRange | null;
  setSelectedChannels: (channels: ChannelId[]) => void;
  setSelectedTimeRange: (timeRange: TimeRange | null) => void;
}

export const createTimeseriesSlice: StateCreator<AppStoreState, [], [], TimeseriesSlice> = (set) => ({
  selectedChannels: [],
  selectedTimeRange: null,
  setSelectedChannels: (selectedChannels) => set({ selectedChannels }),
  setSelectedTimeRange: (selectedTimeRange) => set({ selectedTimeRange }),
});
