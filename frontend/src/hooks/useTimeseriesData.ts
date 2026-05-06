import { useEffect, useMemo, useRef, useState } from "react";

import { TimeseriesService } from "../services/TimeseriesService";
import { useAppStore } from "../stores/useAppStore";
import type {
  ChannelId,
  ModelAttributionResponse,
  ModelBandPowerResponse,
  ModelInferenceResponse,
  TimeseriesDatasetInfo,
  TimeseriesSignalResponse,
  TimeseriesSource,
  TimeseriesSubjectInfo,
  TimeseriesSubjectMetadata,
} from "../types";

const DEFAULT_DATASET_ID = "ds004504";
const DEFAULT_SUBJECT_ID = "sub-001";
const DEFAULT_SOURCE: TimeseriesSource = "derivatives";
const DEFAULT_PREVIEW_MAX_POINTS = 5000;

export function useTimeseriesData() {
  const selectedChannels = useAppStore((state) => state.selectedChannels);
  const selectedTimeseriesBandFilter = useAppStore((state) => state.selectedTimeseriesBandFilter);
  const selectedTimeRange = useAppStore((state) => state.selectedTimeRange);
  const setSelectedChannels = useAppStore((state) => state.setSelectedChannels);
  const setSelectedTimeRange = useAppStore((state) => state.setSelectedTimeRange);

  const [datasets, setDatasets] = useState<TimeseriesDatasetInfo[]>([]);
  const [subjects, setSubjects] = useState<TimeseriesSubjectInfo[]>([]);
  const [datasetId, setDatasetId] = useState(DEFAULT_DATASET_ID);
  const [subjectId, setSubjectId] = useState(DEFAULT_SUBJECT_ID);
  const [source, setSource] = useState<TimeseriesSource>(DEFAULT_SOURCE);
  const [metadata, setMetadata] = useState<TimeseriesSubjectMetadata | null>(null);
  const [signal, setSignal] = useState<TimeseriesSignalResponse | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(true);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingFullSignal, setIsRefreshingFullSignal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inferenceResult, setInferenceResult] = useState<ModelInferenceResponse | null>(null);
  const [isComputingInference, setIsComputingInference] = useState(false);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [hoveredPredictionWindowIndex, setHoveredPredictionWindowIndex] = useState<number | null>(null);
  const [lockedPredictionWindowIndex, setLockedPredictionWindowIndex] = useState<number | null>(null);
  const [topologyAttribution, setTopologyAttribution] = useState<ModelAttributionResponse | null>(null);
  const [isLoadingTopologyAttribution, setIsLoadingTopologyAttribution] = useState(false);
  const [topologyAttributionError, setTopologyAttributionError] = useState<string | null>(null);
  const [bandPower, setBandPower] = useState<ModelBandPowerResponse | null>(null);
  const [isLoadingBandPower, setIsLoadingBandPower] = useState(false);
  const [bandPowerError, setBandPowerError] = useState<string | null>(null);
  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [hoveredChannel, setHoveredChannel] = useState<ChannelId | null>(null);
  const channelsClearedByUserRef = useRef(false);
  const attributionCacheRef = useRef(new Map<string, ModelAttributionResponse>());
  const bandPowerCacheRef = useRef(new Map<string, ModelBandPowerResponse>());

  const selectedSubject = useMemo(() => subjects.find((subject) => subject.id === subjectId), [subjectId, subjects]);
  const availableChannels = useMemo(() => metadata?.channels.map((channel) => channel.name) ?? [], [metadata]);
  const activeChannels = useMemo(
    () => selectedChannels.filter((channel) => availableChannels.includes(channel)),
    [availableChannels, selectedChannels],
  );
  const selectedPredictionWindowIndex = hoveredPredictionWindowIndex ?? lockedPredictionWindowIndex;
  const selectedPredictionWindow = useMemo(
    () =>
      selectedPredictionWindowIndex === null
        ? null
        : (inferenceResult?.predictions[selectedPredictionWindowIndex] ?? null),
    [inferenceResult, selectedPredictionWindowIndex],
  );
  const samplingFrequency = signal
    ? signal.sampling_frequency / Math.max(1, signal.decimation)
    : (metadata?.sampling_frequency ?? 0);
  const sourceOptions = useMemo<TimeseriesSource[]>(() => {
    if (metadata) {
      return orderSources([
        metadata.derivatives_available ? "derivatives" : null,
        metadata.raw_available ? "raw" : null,
      ]);
    }

    return selectedSubject?.sources.length ? orderSources(selectedSubject.sources) : ["derivatives", "raw"];
  }, [metadata, selectedSubject]);

  useEffect(() => {
    let isCurrent = true;

    async function loadDatasets() {
      setIsLoadingDatasets(true);
      setError(null);

      try {
        const nextDatasets = await TimeseriesService.getDatasets();
        if (!isCurrent) {
          return;
        }

        setDatasets(nextDatasets);
        const nextDatasetId = resolveDatasetId(datasetId, nextDatasets);
        if (nextDatasetId && nextDatasetId !== datasetId) {
          setDatasetId(nextDatasetId);
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (isCurrent) {
          setIsLoadingDatasets(false);
        }
      }
    }

    loadDatasets();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function loadSubjects() {
      if (!datasetId) {
        setSubjects([]);
        setSubjectId("");
        setIsLoadingSubjects(false);
        return;
      }

      setIsLoadingSubjects(true);
      setMetadata(null);
      setSignal(null);
      setHoveredChannel(null);
      setError(null);
      setInferenceResult(null);
      setInferenceError(null);
      clearTopologySelectionAndData();
      clearBandPowerData();

      try {
        const nextSubjects = await TimeseriesService.getSubjects(datasetId);
        if (!isCurrent) {
          return;
        }

        setSubjects(nextSubjects);
        const nextSubjectId = resolveSubjectId(subjectId, nextSubjects);
        if (!nextSubjectId) {
          channelsClearedByUserRef.current = false;
          setSubjectId("");
          setSelectedChannels([]);
          setHoveredChannel(null);
          setInferenceResult(null);
          setInferenceError(null);
          clearTopologySelectionAndData();
          clearBandPowerData();
          setError(`No subjects with EEG .set files were found for ${datasetId}.`);
          return;
        }

        if (nextSubjectId !== subjectId) {
          channelsClearedByUserRef.current = false;
          setSubjectId(nextSubjectId);
          setHoveredChannel(null);
        }

        const nextSubject = nextSubjects.find((subject) => subject.id === nextSubjectId);
        const nextSource = resolveSource(source, nextSubject?.sources ?? []);
        if (nextSource !== source) {
          setSource(nextSource);
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (isCurrent) {
          setIsLoadingSubjects(false);
        }
      }
    }

    loadSubjects();

    return () => {
      isCurrent = false;
    };
  }, [datasetId]);

  useEffect(() => {
    let isCurrent = true;

    async function loadSignal() {
      if (!datasetId || !subjectId) {
        setIsLoading(false);
        setIsRefreshingFullSignal(false);
        setSignal(null);
        return;
      }

      setIsLoading(true);
      setIsRefreshingFullSignal(false);
      setError(null);
      setSignal(null);

      try {
        const nextMetadata = await TimeseriesService.getMetadata(datasetId, subjectId, source);
        if (!isCurrent) {
          return;
        }

        setMetadata(nextMetadata);
        const nextAvailableChannels = nextMetadata.channels.map((channel) => channel.name);

        if (nextAvailableChannels.length === 0) {
          setError("No EEG channels are available for this subject.");
          return;
        }

        const nextChannels = resolveChannelsForLoad(
          selectedChannels,
          nextAvailableChannels,
          channelsClearedByUserRef.current,
        );

        if (nextChannels.length === 0) {
          setError(null);
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
            setError("Preview loaded, but the full-resolution signal could not be loaded.");
          }
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(getErrorMessage(loadError));
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
  }, [datasetId, selectedChannels, selectedTimeseriesBandFilter, setSelectedChannels, source, subjectId]);

  const handleDatasetChange = (nextDatasetId: string) => {
    channelsClearedByUserRef.current = false;
    setDatasetId(nextDatasetId);
    setSubjectId("");
    setSubjects([]);
    setMetadata(null);
    setSignal(null);
    setSelectedChannels([]);
    setSelectedTimeRange(null);
    setHoveredChannel(null);
    setInferenceResult(null);
    setInferenceError(null);
    clearTopologySelectionAndData();
    clearBandPowerData();
  };

  const handleSubjectChange = (nextSubjectId: string) => {
    const nextSubject = subjects.find((subject) => subject.id === nextSubjectId);

    setSubjectId(nextSubjectId);
    setMetadata(null);
    setSignal(null);
    setSelectedTimeRange(null);
    setHoveredChannel(null);
    setInferenceResult(null);
    setInferenceError(null);
    clearTopologySelectionAndData();
    clearBandPowerData();
    setSource(resolveSource(source, nextSubject?.sources ?? []));
  };

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
    setSelectedChannels([channel]);
    setSelectedTimeRange(null);
    setHoveredChannel(channel);
  };

  const handleSourceChange = (nextSource: TimeseriesSource) => {
    setSource(nextSource);
    setSelectedTimeRange(null);
    setInferenceResult(null);
    setInferenceError(null);
    clearTopologySelectionAndData();
    clearBandPowerData();
  };

  const handleResetView = () => {
    setResetViewSignal((current) => current + 1);
  };

  const handleComputeInference = async () => {
    if (!datasetId || !subjectId || !signal || activeChannels.length === 0) {
      return;
    }

    setIsComputingInference(true);
    setInferenceError(null);
    clearTopologySelectionAndData();
    clearBandPowerData();

    try {
      const response = await TimeseriesService.computeInference(datasetId, subjectId, source);
      setInferenceResult(response);
    } catch (computeError) {
      setInferenceResult(null);
      setInferenceError(getInferenceErrorMessage(computeError));
    } finally {
      setIsComputingInference(false);
    }
  };

  useEffect(() => {
    if (!datasetId || !subjectId || lockedPredictionWindowIndex === null) {
      setIsLoadingBandPower(false);
      setBandPower(null);
      setBandPowerError(null);
      return;
    }

    const requestSource = source;
    const requestWindowIndex = lockedPredictionWindowIndex;
    const cacheKey = `${datasetId}::${subjectId}::${requestSource}::${requestWindowIndex}`;
    const cachedBandPower = bandPowerCacheRef.current.get(cacheKey);
    if (cachedBandPower) {
      setBandPower(cachedBandPower);
      setBandPowerError(null);
      setIsLoadingBandPower(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingBandPower(true);
    setBandPowerError(null);

    TimeseriesService.computeBandPower(datasetId, subjectId, requestWindowIndex, requestSource)
      .then((response) => {
        if (!isCurrent) {
          return;
        }

        bandPowerCacheRef.current.set(cacheKey, response);
        setBandPower(response);
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setBandPower(null);
        setBandPowerError(getBandPowerErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingBandPower(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [datasetId, lockedPredictionWindowIndex, source, subjectId]);

  function clearTopologySelectionAndData() {
    attributionCacheRef.current.clear();
    setHoveredPredictionWindowIndex(null);
    setLockedPredictionWindowIndex(null);
    setTopologyAttribution(null);
    setIsLoadingTopologyAttribution(false);
    setTopologyAttributionError(null);
  }

  function clearBandPowerData() {
    bandPowerCacheRef.current.clear();
    setBandPower(null);
    setIsLoadingBandPower(false);
    setBandPowerError(null);
  }

  return {
    datasets,
    subjects,
    datasetId,
    subjectId,
    source,
    metadata,
    signal,
    isLoadingDatasets,
    isLoadingSubjects,
    isLoading,
    isRefreshingFullSignal,
    error,
    inferenceResult,
    isComputingInference,
    inferenceError,
    hoveredPredictionWindowIndex,
    lockedPredictionWindowIndex,
    selectedPredictionWindowIndex,
    selectedPredictionWindow,
    topologyAttribution,
    isLoadingTopologyAttribution,
    topologyAttributionError,
    bandPower,
    isLoadingBandPower,
    bandPowerError,
    resetViewSignal,
    hoveredChannel,
    setHoveredChannel,
    setHoveredPredictionWindowIndex,
    setLockedPredictionWindowIndex,
    selectedChannels,
    selectedTimeseriesBandFilter,
    selectedTimeRange,
    setSelectedTimeRange,
    availableChannels,
    activeChannels,
    samplingFrequency,
    sourceOptions,
    handleDatasetChange,
    handleSubjectChange,
    handleChannelToggle,
    handleSingleChannelSelect,
    handleSourceChange,
    handleResetView,
    handleComputeInference,
  };
}

function resolveSelectedChannels(selectedChannels: ChannelId[], availableChannels: ChannelId[]): ChannelId[] {
  const validSelectedChannels = selectedChannels.filter((channel) => availableChannels.includes(channel));
  if (validSelectedChannels.length > 0) {
    return validSelectedChannels;
  }

  return availableChannels.slice(0, 1);
}

function resolveChannelsForLoad(
  selectedChannels: ChannelId[],
  availableChannels: ChannelId[],
  clearedByUser: boolean,
): ChannelId[] {
  const validSelectedChannels = selectedChannels.filter((channel) => availableChannels.includes(channel));
  if (validSelectedChannels.length > 0) {
    return validSelectedChannels;
  }

  if (clearedByUser) {
    return [];
  }

  return resolveSelectedChannels(selectedChannels, availableChannels);
}

function areSameChannels(left: ChannelId[], right: ChannelId[]): boolean {
  return left.length === right.length && left.every((channel, index) => channel === right[index]);
}

function resolveDatasetId(currentDatasetId: string, datasets: TimeseriesDatasetInfo[]): string {
  if (datasets.some((dataset) => dataset.id === currentDatasetId)) {
    return currentDatasetId;
  }

  return datasets.find((dataset) => dataset.id === DEFAULT_DATASET_ID)?.id ?? datasets[0]?.id ?? "";
}

function resolveSubjectId(currentSubjectId: string, subjects: TimeseriesSubjectInfo[]): string {
  if (subjects.some((subject) => subject.id === currentSubjectId)) {
    return currentSubjectId;
  }

  return subjects.find((subject) => subject.id === DEFAULT_SUBJECT_ID)?.id ?? subjects[0]?.id ?? "";
}

function resolveSource(currentSource: TimeseriesSource, sources: TimeseriesSource[]): TimeseriesSource {
  if (sources.includes(currentSource)) {
    return currentSource;
  }

  return sources.includes(DEFAULT_SOURCE) ? DEFAULT_SOURCE : (sources[0] ?? DEFAULT_SOURCE);
}

function orderSources(sources: Array<TimeseriesSource | null>): TimeseriesSource[] {
  const uniqueSources = new Set(sources.filter((source): source is TimeseriesSource => source !== null));
  return (["derivatives", "raw"] as TimeseriesSource[]).filter((source) => uniqueSources.has(source));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to load EEG timeseries: ${error.message}`;
  }

  return "Unable to load EEG timeseries.";
}

function getInferenceErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to compute inference: ${error.message}`;
  }

  return "Unable to compute inference.";
}

function getAttributionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to compute topology attribution: ${error.message}`;
  }

  return "Unable to compute topology attribution.";
}

function getBandPowerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to compute total band power: ${error.message}`;
  }

  return "Unable to compute total band power.";
}

function createAttributionCacheKey(
  datasetId: string,
  subjectId: string,
  source: TimeseriesSource,
  windowIndex: number,
): string {
  return `${datasetId}::${subjectId}::${source}::${windowIndex}`;
}

export type TimeseriesDataController = ReturnType<typeof useTimeseriesData>;
