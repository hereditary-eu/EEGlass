import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppStore } from "../stores/useAppStore";
import { TimeseriesService } from "../services/TimeseriesService";
import type { ChannelId, ModelInfoResponse, TimeseriesSource } from "../types";
import { DEFAULT_DATASET_ID, DEFAULT_SOURCE, DEFAULT_SUBJECT_ID } from "./timeseries/shared";
import { useSelectedTimeseriesWindow } from "./timeseries/useSelectedTimeseriesWindow";
import { useTimeseriesBandPower } from "./timeseries/useTimeseriesBandPower";
import { useTimeseriesPredictions } from "./timeseries/useTimeseriesPredictions";
import { useTimeseriesSignal } from "./timeseries/useTimeseriesSignal";
import { useTimeseriesSubjectSource } from "./timeseries/useTimeseriesSubjectSource";

interface UseTimeseriesDataOptions {
  datasetId?: string;
  subjectId?: string;
}

export function useTimeseriesData(options: UseTimeseriesDataOptions = {}) {
  const routeDatasetId = options.datasetId ?? DEFAULT_DATASET_ID;
  const routeSubjectId = options.subjectId ?? DEFAULT_SUBJECT_ID;
  const selectedChannels = useAppStore((state) => state.selectedChannels);
  const source = useAppStore((state) => state.selectedTimeseriesSource);
  const selectedTimeseriesBandFilter = useAppStore((state) => state.selectedTimeseriesBandFilter);
  const selectedTimeRange = useAppStore((state) => state.selectedTimeRange);
  const hoveredPredictionWindowIndex = useAppStore((state) => state.hoveredPredictionWindowIndex);
  const lockedPredictionWindowIndex = useAppStore((state) => state.lockedPredictionWindowIndex);
  const setSelectedChannels = useAppStore((state) => state.setSelectedChannels);
  const selectSingleTimeseriesChannel = useAppStore((state) => state.selectSingleTimeseriesChannel);
  const setSelectedTimeseriesSource = useAppStore((state) => state.setSelectedTimeseriesSource);
  const setSelectedTimeRange = useAppStore((state) => state.setSelectedTimeRange);
  const setHoveredPredictionWindowIndex = useAppStore((state) => state.setHoveredPredictionWindowIndex);
  const setLockedPredictionWindowIndex = useAppStore((state) => state.setLockedPredictionWindowIndex);
  const clearSelectedPredictionWindow = useAppStore((state) => state.clearSelectedPredictionWindow);

  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [hoveredChannel, setHoveredChannel] = useState<ChannelId | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);
  const channelsClearedByUserRef = useRef(false);
  const [bandPowerResetSignal, setBandPowerResetSignal] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    TimeseriesService.getModelInfo()
      .then((nextModelInfo) => {
        if (isCurrent) {
          setModelInfo(nextModelInfo);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setModelInfo(null);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const clearBandPowerFromCoordinator = useCallback(() => {
    setBandPowerResetSignal((current) => current + 1);
  }, []);

  const resetPatientViewState = useCallback(() => {
    channelsClearedByUserRef.current = false;
    setSelectedChannels([]);
    setSelectedTimeRange(null);
    setHoveredChannel(null);
    clearSelectedPredictionWindow();
    clearBandPowerFromCoordinator();
  }, [clearBandPowerFromCoordinator, clearSelectedPredictionWindow, setSelectedChannels, setSelectedTimeRange]);

  const {
    datasets,
    subjects,
    datasetId,
    subjectId,
    selectedSubject,
    isSelectedSubjectReady,
    sourceOptions,
    isLoadingDatasets,
    isLoadingSubjects,
    subjectSourceError,
  } = useTimeseriesSubjectSource({
    routeDatasetId,
    routeSubjectId,
    source,
    setSelectedTimeseriesSource,
    onRouteChange: resetPatientViewState,
    onSubjectReset: resetPatientViewState,
  });

  const {
    metadata,
    signal,
    isLoading,
    isRefreshingFullSignal,
    signalError,
    availableChannels,
    activeChannels,
    samplingFrequency,
    sourceOptionsFromMetadata,
    resetSignal,
  } = useTimeseriesSignal({
    datasetId,
    subjectId,
    source,
    selectedChannels,
    selectedTimeseriesBandFilter,
    channelsClearedByUser: channelsClearedByUserRef.current,
    setSelectedChannels,
    setHoveredChannel,
  });

  const resolvedSourceOptions = useMemo<TimeseriesSource[]>(
    () => sourceOptionsFromMetadata ?? sourceOptions,
    [sourceOptions, sourceOptionsFromMetadata],
  );

  const {
    bandPower,
    bandPowerStats,
    bandPowerStatsMode,
    isInterBandPowerStatsUnavailable,
    isLoadingBandPower,
    isLoadingBandPowerStats,
    bandPowerError,
    bandPowerStatsError,
    setBandPowerStatsMode,
    clearBandPowerData,
  } = useTimeseriesBandPower({
    datasetId,
    subjectId,
    source,
    lockedPredictionWindowIndex,
  });

  useEffect(() => {
    clearBandPowerData();
  }, [bandPowerResetSignal, clearBandPowerData]);

  const resetBandPower = useCallback(() => {
    clearBandPowerData();
  }, [clearBandPowerData]);

  const {
    inferenceResult,
    isComputingInference,
    isDatasetPredictionJobRunning,
    inferenceError,
    resetPredictions,
    handleComputeInference,
  } = useTimeseriesPredictions({
    datasetId,
    subjectId,
    source,
    signal,
    activeChannels,
    isLoadingSubjects,
    isSelectedSubjectReady,
    setLockedPredictionWindowIndex,
    clearSelectedPredictionWindow,
    onPredictionReset: resetBandPower,
  });

  const { selectedPredictionWindowIndex, selectedPredictionWindow } = useSelectedTimeseriesWindow({
    inferenceResult,
    hoveredPredictionWindowIndex,
    lockedPredictionWindowIndex,
  });

  const handleChannelToggle = (channel: ChannelId) => {
    const nextChannels = selectedChannels.includes(channel)
      ? selectedChannels.filter((selectedChannel) => selectedChannel !== channel)
      : [...selectedChannels, channel];

    channelsClearedByUserRef.current = nextChannels.length === 0;
    setSelectedChannels(nextChannels);
    setSelectedTimeRange(null);
    setHoveredChannel((currentHoveredChannel) =>
      currentHoveredChannel && nextChannels.includes(currentHoveredChannel) ? currentHoveredChannel : null,
    );
  };

  const handleSingleChannelSelect = (channel: ChannelId) => {
    channelsClearedByUserRef.current = false;
    selectSingleTimeseriesChannel(channel);
    setHoveredChannel(channel);
  };

  const handleSourceChange = (nextSource: TimeseriesSource) => {
    setSelectedTimeseriesSource(nextSource);
    setSelectedTimeRange(null);
    resetSignal();
    resetPredictions();
    clearBandPowerData();
  };

  const handleResetView = () => {
    setResetViewSignal((current) => current + 1);
  };

  return {
    datasets,
    subjects,
    datasetId,
    subjectId,
    source,
    modelInfo,
    metadata,
    signal,
    isLoadingDatasets,
    isLoadingSubjects,
    isLoading,
    isRefreshingFullSignal,
    error: subjectSourceError ?? signalError,
    inferenceResult,
    isComputingInference,
    isDatasetPredictionJobRunning,
    inferenceError,
    hoveredPredictionWindowIndex,
    lockedPredictionWindowIndex,
    selectedPredictionWindowIndex,
    selectedPredictionWindow,
    bandPower,
    bandPowerStats,
    bandPowerStatsMode,
    isInterBandPowerStatsUnavailable,
    isLoadingBandPower,
    isLoadingBandPowerStats,
    bandPowerError,
    bandPowerStatsError,
    setBandPowerStatsMode,
    resetViewSignal,
    hoveredChannel,
    setHoveredChannel,
    setHoveredPredictionWindowIndex,
    setLockedPredictionWindowIndex,
    selectedChannels,
    selectedTimeseriesBandFilter,
    selectedTimeRange,
    setSelectedTimeRange,
    selectedSubject,
    availableChannels,
    activeChannels,
    samplingFrequency,
    sourceOptions: resolvedSourceOptions,
    handleChannelToggle,
    handleSingleChannelSelect,
    handleSourceChange,
    handleResetView,
    handleComputeInference,
  };
}

export type TimeseriesDataController = ReturnType<typeof useTimeseriesData>;
