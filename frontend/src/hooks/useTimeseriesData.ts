import { useEffect, useMemo, useRef, useState } from "react";

import { TimeseriesService } from "../services/TimeseriesService";
import { useAppStore } from "../stores/useAppStore";
import type {
  ChannelId,
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
const PREDICTION_CACHE_RETRY_COUNT = 4;
const PREDICTION_CACHE_RETRY_DELAY_MS = 650;

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

  const [datasets, setDatasets] = useState<TimeseriesDatasetInfo[]>([]);
  const [subjects, setSubjects] = useState<TimeseriesSubjectInfo[]>([]);
  const [datasetId, setDatasetId] = useState(routeDatasetId);
  const [subjectId, setSubjectId] = useState(routeSubjectId);
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
  const [bandPower, setBandPower] = useState<ModelBandPowerResponse | null>(null);
  const [isLoadingBandPower, setIsLoadingBandPower] = useState(false);
  const [bandPowerError, setBandPowerError] = useState<string | null>(null);
  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [hoveredChannel, setHoveredChannel] = useState<ChannelId | null>(null);
  const channelsClearedByUserRef = useRef(false);
  const bandPowerCacheRef = useRef(new Map<string, ModelBandPowerResponse>());

  useEffect(() => {
    channelsClearedByUserRef.current = false;
    setDatasetId(routeDatasetId);
    setSubjectId(routeSubjectId);
    setSubjects([]);
    setMetadata(null);
    setSignal(null);
    setSelectedChannels([]);
    setSelectedTimeseriesSource(DEFAULT_SOURCE);
    setSelectedTimeRange(null);
    setHoveredChannel(null);
    setInferenceResult(null);
    setInferenceError(null);
    clearPredictionWindowSelection();
    clearBandPowerData();
  }, [routeDatasetId, routeSubjectId, setSelectedChannels, setSelectedTimeRange, setSelectedTimeseriesSource]);

  const selectedSubject = useMemo(() => subjects.find((subject) => subject.id === subjectId), [subjectId, subjects]);
  const isSelectedSubjectReady = useMemo(
    () => Boolean(selectedSubject && selectedSubject.sources.includes(source)),
    [selectedSubject, source],
  );
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
        if (!nextDatasets.some((dataset) => dataset.id === routeDatasetId)) {
          setError(`Dataset ${routeDatasetId} was not found.`);
          setDatasetId("");
          setSubjectId("");
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
  }, [routeDatasetId]);

  useEffect(() => {
    let isCurrent = true;

    async function loadSubjects() {
      if (isLoadingDatasets) {
        setIsLoadingSubjects(false);
        return;
      }

      if (!datasetId) {
        setSubjects([]);
        setSubjectId("");
        setIsLoadingSubjects(false);
        return;
      }

      if (datasets.length > 0 && !datasets.some((dataset) => dataset.id === datasetId)) {
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
      clearPredictionWindowSelection();
      clearBandPowerData();

      try {
        const nextSubjects = await TimeseriesService.getSubjects(datasetId);
        if (!isCurrent) {
          return;
        }

        setSubjects(nextSubjects);
        if (!nextSubjects.some((subject) => subject.id === routeSubjectId)) {
          channelsClearedByUserRef.current = false;
          setSubjectId("");
          setSelectedChannels([]);
          setHoveredChannel(null);
          setInferenceResult(null);
          setInferenceError(null);
          clearPredictionWindowSelection();
          clearBandPowerData();
          setError(`Subject ${routeSubjectId} was not found in ${datasetId}.`);
          return;
        }

        if (routeSubjectId !== subjectId) {
          channelsClearedByUserRef.current = false;
          setSubjectId(routeSubjectId);
          setHoveredChannel(null);
        }

        const nextSubject = nextSubjects.find((subject) => subject.id === routeSubjectId);
        const nextSource = resolveSource(source, nextSubject?.sources ?? []);
        if (nextSource !== source) {
          setSelectedTimeseriesSource(nextSource);
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
  }, [datasetId, datasets, isLoadingDatasets, routeSubjectId]);

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
    setInferenceResult(null);
    setInferenceError(null);
    clearPredictionWindowSelection();
    clearBandPowerData();
  };

  const handleResetView = () => {
    setResetViewSignal((current) => current + 1);
  };

  const handleComputeInference = async () => {
    if (!datasetId || !subjectId || !signal || activeChannels.length === 0 || isComputingInference) {
      return;
    }

    setIsComputingInference(true);
    setInferenceError(null);
    setInferenceResult(null);
    clearPredictionWindowSelection();
    clearBandPowerData();

    try {
      const response = await TimeseriesService.computeAndCachePredictions(datasetId, subjectId, source);
      setInferenceResult(response);
      setLockedPredictionWindowIndex(response.predictions.length > 0 ? 0 : null);
    } catch (computeError) {
      setInferenceResult(null);
      setInferenceError(getInferenceErrorMessage(computeError));
    } finally {
      setIsComputingInference(false);
    }
  };

  useEffect(() => {
    if (!datasetId || !subjectId) {
      setInferenceResult(null);
      setInferenceError(null);
      setIsComputingInference(false);
      return;
    }

    if (isLoadingSubjects || !isSelectedSubjectReady) {
      setInferenceResult(null);
      setInferenceError(null);
      setIsComputingInference(false);
      return;
    }

    let isCurrent = true;
    setIsComputingInference(true);
    setInferenceError(null);
    setInferenceResult(null);
    clearPredictionWindowSelection();
    clearBandPowerData();

    getCachedPredictionsWithRetry(datasetId, subjectId, source)
      .then((response) => {
        if (isCurrent) {
          setInferenceResult(response);
          setLockedPredictionWindowIndex(response.predictions.length > 0 ? 0 : null);
        }
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setInferenceResult(null);
        setInferenceError(getPredictionCacheErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsComputingInference(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [datasetId, isLoadingSubjects, isSelectedSubjectReady, source, subjectId]);

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

  function clearPredictionWindowSelection() {
    clearSelectedPredictionWindow();
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

function getPredictionCacheErrorMessage(error: unknown): string {
  const statusCode = getErrorStatusCode(error);

  if (statusCode === 404) {
    return "Predictions not computed yet.";
  }

  if (error instanceof Error) {
    return `Unable to load cached predictions: ${error.message}`;
  }

  return "Unable to load cached predictions.";
}

async function getCachedPredictionsWithRetry(
  datasetId: string,
  subjectId: string,
  source: TimeseriesSource,
): Promise<ModelInferenceResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= PREDICTION_CACHE_RETRY_COUNT; attempt += 1) {
    try {
      return await TimeseriesService.getCachedPredictions(datasetId, subjectId, source);
    } catch (error) {
      lastError = error;
      if (getErrorStatusCode(error) !== 404 || attempt === PREDICTION_CACHE_RETRY_COUNT) {
        throw error;
      }
      await wait(PREDICTION_CACHE_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

function getErrorStatusCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "statusCode" in error
    ? (error as { statusCode?: unknown }).statusCode
    : undefined;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function getBandPowerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to compute total band power: ${error.message}`;
  }

  return "Unable to compute total band power.";
}

export type TimeseriesDataController = ReturnType<typeof useTimeseriesData>;
