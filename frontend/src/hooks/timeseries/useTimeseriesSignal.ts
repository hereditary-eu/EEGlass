import { useEffect, useMemo, useState } from "react";

import { TimeseriesService } from "../../services/TimeseriesService";
import type {
  ChannelId,
  TimeseriesBandFilter,
  TimeseriesSignalResponse,
  TimeseriesSource,
  TimeseriesSubjectMetadata,
} from "../../types";
import {
  areSameChannels,
  DEFAULT_PREVIEW_MAX_POINTS,
  getErrorMessage,
  orderSources,
  resolveChannelsForLoad,
} from "./shared";

interface UseTimeseriesSignalOptions {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  selectedChannels: ChannelId[];
  selectedTimeseriesBandFilter: TimeseriesBandFilter | null;
  channelsClearedByUser: boolean;
  setSelectedChannels: (channels: ChannelId[]) => void;
  setHoveredChannel: (channel: ChannelId | null | ((channel: ChannelId | null) => ChannelId | null)) => void;
}

export function useTimeseriesSignal({
  datasetId,
  subjectId,
  source,
  selectedChannels,
  selectedTimeseriesBandFilter,
  channelsClearedByUser,
  setSelectedChannels,
  setHoveredChannel,
}: UseTimeseriesSignalOptions) {
  const [metadata, setMetadata] = useState<TimeseriesSubjectMetadata | null>(null);
  const [signal, setSignal] = useState<TimeseriesSignalResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingFullSignal, setIsRefreshingFullSignal] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);

  const availableChannels = useMemo(() => metadata?.channels.map((channel) => channel.name) ?? [], [metadata]);
  const activeChannels = useMemo(
    () => selectedChannels.filter((channel) => availableChannels.includes(channel)),
    [availableChannels, selectedChannels],
  );
  const samplingFrequency = signal
    ? signal.sampling_frequency / Math.max(1, signal.decimation)
    : (metadata?.sampling_frequency ?? 0);
  const sourceOptionsFromMetadata = useMemo<TimeseriesSource[] | null>(() => {
    if (!metadata) {
      return null;
    }

    return orderSources([metadata.derivatives_available ? "derivatives" : null, metadata.raw_available ? "raw" : null]);
  }, [metadata]);

  useEffect(() => {
    let isCurrent = true;

    async function loadSignal() {
      if (!datasetId || !subjectId) {
        setIsLoading(false);
        setIsRefreshingFullSignal(false);
        setMetadata(null);
        setSignal(null);
        return;
      }

      setIsLoading(true);
      setIsRefreshingFullSignal(false);
      setSignalError(null);
      setSignal(null);

      try {
        const nextMetadata = await TimeseriesService.getMetadata(datasetId, subjectId, source);
        if (!isCurrent) {
          return;
        }

        setMetadata(nextMetadata);
        const nextAvailableChannels = nextMetadata.channels.map((channel) => channel.name);

        if (nextAvailableChannels.length === 0) {
          setSignalError("No EEG channels are available for this subject.");
          return;
        }

        const nextChannels = resolveChannelsForLoad(selectedChannels, nextAvailableChannels, channelsClearedByUser);
        if (nextChannels.length === 0) {
          setSignalError(null);
          setSignal(null);
          setIsLoading(false);
          setIsRefreshingFullSignal(false);
          return;
        }

        if (!areSameChannels(nextChannels, selectedChannels)) {
          setSelectedChannels(nextChannels);
          return;
        }

        const preview = await TimeseriesService.getPreview(datasetId, subjectId, {
          channels: nextChannels,
          source,
          maxPoints: DEFAULT_PREVIEW_MAX_POINTS,
          bandFilter: selectedTimeseriesBandFilter,
        });
        if (!isCurrent) {
          return;
        }

        setSignal(preview);
        setIsLoading(false);
        setIsRefreshingFullSignal(true);

        try {
          const fullSignal = await TimeseriesService.getSignal(datasetId, subjectId, {
            channels: nextChannels,
            source,
            bandFilter: selectedTimeseriesBandFilter,
          });
          if (isCurrent) {
            setSignal(fullSignal);
          }
        } catch {
          if (isCurrent) {
            setSignalError("Preview loaded, but the full-resolution signal could not be loaded.");
          }
        }
      } catch (loadError) {
        if (isCurrent) {
          setSignalError(getErrorMessage(loadError));
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
          setIsRefreshingFullSignal(false);
        }
      }
    }

    loadSignal();

    return () => {
      isCurrent = false;
    };
  }, [
    channelsClearedByUser,
    datasetId,
    selectedChannels,
    selectedTimeseriesBandFilter,
    setHoveredChannel,
    setSelectedChannels,
    source,
    subjectId,
  ]);

  function resetSignal() {
    setMetadata(null);
    setSignal(null);
    setHoveredChannel(null);
  }

  return {
    metadata,
    signal,
    isLoading,
    isRefreshingFullSignal,
    signalError,
    setSignalError,
    availableChannels,
    activeChannels,
    samplingFrequency,
    sourceOptionsFromMetadata,
    resetSignal,
  };
}
