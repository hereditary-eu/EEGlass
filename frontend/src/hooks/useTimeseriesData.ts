import { useEffect, useMemo, useState } from "react";

import { TimeseriesService } from "../services/TimeseriesService";
import { useAppStore } from "../stores/useAppStore";
import type {
  ChannelId,
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
  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [hoveredChannel, setHoveredChannel] = useState<ChannelId | null>(null);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === subjectId),
    [subjectId, subjects],
  );
  const availableChannels = useMemo(
    () => metadata?.channels.map((channel) => channel.name) ?? [],
    [metadata],
  );
  const activeChannels = useMemo(
    () => selectedChannels.filter((channel) => availableChannels.includes(channel)),
    [availableChannels, selectedChannels],
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

      try {
        const nextSubjects = await TimeseriesService.getSubjects(datasetId);
        if (!isCurrent) {
          return;
        }

        setSubjects(nextSubjects);
        const nextSubjectId = resolveSubjectId(subjectId, nextSubjects);
        if (!nextSubjectId) {
          setSubjectId("");
          setSelectedChannels([]);
          setHoveredChannel(null);
          setError(`No subjects with EEG .set files were found for ${datasetId}.`);
          return;
        }

        if (nextSubjectId !== subjectId) {
          setSubjectId(nextSubjectId);
          setSelectedChannels([]);
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
        const nextChannels = resolveSelectedChannels(selectedChannels, nextAvailableChannels);

        if (nextChannels.length === 0) {
          setError("No EEG channels are available for this subject.");
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
  }, [datasetId, selectedChannels, setSelectedChannels, source, subjectId]);

  const handleDatasetChange = (nextDatasetId: string) => {
    setDatasetId(nextDatasetId);
    setSubjectId("");
    setSubjects([]);
    setMetadata(null);
    setSignal(null);
    setSelectedChannels([]);
    setSelectedTimeRange(null);
    setHoveredChannel(null);
  };

  const handleSubjectChange = (nextSubjectId: string) => {
    const nextSubject = subjects.find((subject) => subject.id === nextSubjectId);

    setSubjectId(nextSubjectId);
    setMetadata(null);
    setSignal(null);
    setSelectedChannels([]);
    setSelectedTimeRange(null);
    setHoveredChannel(null);
    setSource(resolveSource(source, nextSubject?.sources ?? []));
  };

  const handleChannelToggle = (channel: ChannelId) => {
    const nextChannels = selectedChannels.includes(channel)
      ? selectedChannels.filter((selectedChannel) => selectedChannel !== channel)
      : [...selectedChannels, channel];

    if (nextChannels.length === 0) {
      return;
    }

    setSelectedChannels(nextChannels);
    setSelectedTimeRange(null);
    setHoveredChannel((currentHoveredChannel) =>
      currentHoveredChannel && nextChannels.includes(currentHoveredChannel) ? currentHoveredChannel : null,
    );
  };

  const handleSourceChange = (nextSource: TimeseriesSource) => {
    setSource(nextSource);
    setSelectedTimeRange(null);
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
    metadata,
    signal,
    isLoadingDatasets,
    isLoadingSubjects,
    isLoading,
    isRefreshingFullSignal,
    error,
    resetViewSignal,
    hoveredChannel,
    setHoveredChannel,
    selectedChannels,
    selectedTimeRange,
    setSelectedTimeRange,
    availableChannels,
    activeChannels,
    samplingFrequency,
    sourceOptions,
    handleDatasetChange,
    handleSubjectChange,
    handleChannelToggle,
    handleSourceChange,
    handleResetView,
  };
}

function resolveSelectedChannels(selectedChannels: ChannelId[], availableChannels: ChannelId[]): ChannelId[] {
  const validSelectedChannels = selectedChannels.filter((channel) => availableChannels.includes(channel));
  if (validSelectedChannels.length > 0) {
    return validSelectedChannels;
  }

  const preferredChannel = availableChannels.find((channel) => channel.toLowerCase() === "fp1");
  return preferredChannel ? [preferredChannel] : availableChannels.slice(0, 1);
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
