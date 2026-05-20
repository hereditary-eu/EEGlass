import { useCallback, useRef, useState } from "react";

import type { ChannelId } from "../../types";

interface UseTimeseriesChannelInteractionsOptions {
  selectedChannels: ChannelId[];
  setSelectedChannels: (channels: ChannelId[]) => void;
  selectSingleTimeseriesChannel: (channel: ChannelId) => void;
  setSelectedTimeRange: (timeRange: null) => void;
}

export function useTimeseriesChannelInteractions({
  selectedChannels,
  setSelectedChannels,
  selectSingleTimeseriesChannel,
  setSelectedTimeRange,
}: UseTimeseriesChannelInteractionsOptions) {
  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [hoveredChannel, setHoveredChannel] = useState<ChannelId | null>(null);
  const channelsClearedByUserRef = useRef(false);

  const resetLocalPatientViewState = useCallback(() => {
    channelsClearedByUserRef.current = false;
    setSelectedChannels([]);
    setSelectedTimeRange(null);
    setHoveredChannel(null);
  }, [setSelectedChannels, setSelectedTimeRange]);

  const handleChannelToggle = useCallback(
    (channel: ChannelId) => {
      const nextChannels = selectedChannels.includes(channel)
        ? selectedChannels.filter((selectedChannel) => selectedChannel !== channel)
        : [...selectedChannels, channel];

      channelsClearedByUserRef.current = nextChannels.length === 0;
      setSelectedChannels(nextChannels);
      setSelectedTimeRange(null);
      setHoveredChannel((currentHoveredChannel) =>
        currentHoveredChannel && nextChannels.includes(currentHoveredChannel) ? currentHoveredChannel : null,
      );
    },
    [selectedChannels, setSelectedChannels, setSelectedTimeRange],
  );

  const handleSingleChannelSelect = useCallback(
    (channel: ChannelId) => {
      channelsClearedByUserRef.current = false;
      selectSingleTimeseriesChannel(channel);
      setHoveredChannel(channel);
    },
    [selectSingleTimeseriesChannel],
  );

  const handleResetView = useCallback(() => {
    setResetViewSignal((current) => current + 1);
  }, []);

  return {
    resetViewSignal,
    hoveredChannel,
    setHoveredChannel,
    channelsClearedByUserRef,
    resetLocalPatientViewState,
    handleChannelToggle,
    handleSingleChannelSelect,
    handleResetView,
  };
}
