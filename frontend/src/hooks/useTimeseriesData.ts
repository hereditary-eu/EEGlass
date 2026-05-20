import { useCallback, useEffect, useMemo } from "react";

import { useAppStore } from "../stores/useAppStore";
import type { TimeseriesSource } from "../types";
import { DEFAULT_DATASET_ID, DEFAULT_SOURCE, DEFAULT_SUBJECT_ID } from "./timeseries/shared";
import { useSelectedTimeseriesWindow } from "./timeseries/useSelectedTimeseriesWindow";
import { useTimeseriesBandPower } from "./timeseries/useTimeseriesBandPower";
import { useTimeseriesChannelInteractions } from "./timeseries/useTimeseriesChannelInteractions";
import { useTimeseriesModelInfo } from "./timeseries/useTimeseriesModelInfo";
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

  const modelInfo = useTimeseriesModelInfo();
  const modelName = modelInfo?.name;
  const {
    resetViewSignal,
    hoveredChannel,
    setHoveredChannel,
    channelsClearedByUserRef,
    resetLocalPatientViewState,
    handleChannelToggle,
    handleSingleChannelSelect,
    handleResetView,
  } = useTimeseriesChannelInteractions({
    selectedChannels,
    setSelectedChannels,
    selectSingleTimeseriesChannel,
    setSelectedTimeRange,
  });

  const resetPatientViewState = useCallback(() => {
    resetLocalPatientViewState();
    clearSelectedPredictionWindow();
  }, [clearSelectedPredictionWindow, resetLocalPatientViewState]);

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
    modelName,
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
    modelName,
    lockedPredictionWindowIndex,
  });

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
    modelName,
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

  const handleSourceChange = useCallback((nextSource: TimeseriesSource) => {
    setSelectedTimeseriesSource(nextSource);
    setSelectedTimeRange(null);
    resetSignal();
    resetPredictions();
    clearBandPowerData();
  }, [clearBandPowerData, resetPredictions, resetSignal, setSelectedTimeRange, setSelectedTimeseriesSource]);

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
