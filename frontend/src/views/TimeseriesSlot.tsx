import { useEffect, useMemo, useState } from "react";
import type React from "react";

import { EegTimeseries } from "../components";
import type { TimeseriesWindowAnnotationRow } from "../components";
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
import "./TimeseriesSlot.css";

const DEFAULT_DATASET_ID = "ds004504";
const DEFAULT_SUBJECT_ID = "sub-001";
const DEFAULT_SOURCE: TimeseriesSource = "derivatives";
const DEFAULT_PREVIEW_MAX_POINTS = 5000;
const WINDOW_SIZE_SECONDS = 2;

export function TimeseriesSlot() {
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
  const annotationChannel = hoveredChannel && activeChannels.includes(hoveredChannel) ? hoveredChannel : activeChannels[0];
  const windowAnnotationRows = useMemo(
    () => createWindowAnnotationRows(annotationChannel, signal?.duration ?? metadata?.duration ?? 0),
    [annotationChannel, metadata?.duration, signal?.duration],
  );
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

  const handleDatasetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setDatasetId(event.currentTarget.value);
    setSubjectId("");
    setSubjects([]);
    setMetadata(null);
    setSignal(null);
    setSelectedChannels([]);
    setSelectedTimeRange(null);
    setHoveredChannel(null);
  };

  const handleSubjectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSubjectId = event.currentTarget.value;
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

  const handleSourceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSource(event.currentTarget.value as TimeseriesSource);
    setSelectedTimeRange(null);
  };

  const handleResetView = () => {
    setResetViewSignal((current) => current + 1);
  };

  return (
    <div className="timeseries-slot">
      <div className="timeseries-slot-header" aria-label="Timeseries controls">
        <div className="timeseries-slot-controls">
          <select
            className="timeseries-slot-select timeseries-slot-select--dataset"
            value={datasetId}
            onChange={handleDatasetChange}
            disabled={isLoadingDatasets || datasets.length === 0}
            aria-label="EEG dataset"
          >
            {datasets.length === 0 ? <option value={datasetId}>{datasetId}</option> : null}
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.id}
              </option>
            ))}
          </select>
          <select
            className="timeseries-slot-select timeseries-slot-select--subject"
            value={subjectId}
            onChange={handleSubjectChange}
            disabled={isLoadingSubjects || subjects.length === 0}
            aria-label="EEG subject"
          >
            {subjects.length === 0 ? <option value={subjectId}>{subjectId || "Subject"}</option> : null}
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.id}
              </option>
            ))}
          </select>
          <ChannelMultiSelect
            channels={availableChannels}
            selectedChannels={activeChannels}
            disabled={availableChannels.length === 0}
            onChannelToggle={handleChannelToggle}
          />
          <select className="timeseries-slot-select" value={source} onChange={handleSourceChange} aria-label="EEG source">
            {sourceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="timeseries-slot-actions">
          {isLoadingDatasets ? <span className="timeseries-slot-status">Loading datasets</span> : null}
          {isLoadingSubjects ? <span className="timeseries-slot-status">Loading subjects</span> : null}
          {isRefreshingFullSignal ? <span className="timeseries-slot-status">Loading full signal</span> : null}
          {signal && error ? <span className="timeseries-slot-status timeseries-slot-status--error">{error}</span> : null}
          <span className="timeseries-slot-status">{signal ? (signal.preview ? "Preview" : "Full") : "Idle"}</span>
          {annotationChannel ? <span className="timeseries-slot-status">Annotations: {annotationChannel}</span> : null}
          <button type="button" className="timeseries-slot-button" onClick={handleResetView}>
            Reset view
          </button>
          {selectedTimeRange ? (
            <button type="button" className="timeseries-slot-button" onClick={() => setSelectedTimeRange(null)}>
              Clear range
            </button>
          ) : null}
        </div>
      </div>

      <div className="timeseries-slot-canvas">
        <EegTimeseries
          samples={signal?.samples ?? {}}
          samplingFrequency={samplingFrequency}
          channels={signal?.channels ?? activeChannels}
          selectedTimeRange={selectedTimeRange}
          onSelectedTimeRangeChange={setSelectedTimeRange}
          resetViewSignal={resetViewSignal}
          hoveredChannel={hoveredChannel}
          onHoveredChannelChange={setHoveredChannel}
          windowSizeSeconds={WINDOW_SIZE_SECONDS}
          windowAnnotationRows={windowAnnotationRows}
          isPreview={signal?.preview ?? true}
          isLoading={isLoading}
          error={signal ? null : error}
        />
      </div>
    </div>
  );
}

interface ChannelMultiSelectProps {
  channels: ChannelId[];
  selectedChannels: ChannelId[];
  disabled: boolean;
  onChannelToggle: (channel: ChannelId) => void;
}

function ChannelMultiSelect({ channels, selectedChannels, disabled, onChannelToggle }: ChannelMultiSelectProps) {
  const label = getChannelPickerLabel(selectedChannels);

  if (disabled) {
    return (
      <button type="button" className="timeseries-channel-trigger" disabled>
        Channels
      </button>
    );
  }

  return (
    <details className="timeseries-channel-picker">
      <summary className="timeseries-channel-trigger">{label}</summary>
      <div className="timeseries-channel-menu" role="group" aria-label="EEG channels">
        {channels.map((channel) => {
          const isSelected = selectedChannels.includes(channel);
          return (
            <label key={channel} className="timeseries-channel-option">
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isSelected && selectedChannels.length === 1}
                onChange={() => onChannelToggle(channel)}
              />
              <span>{channel}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}

function resolveSelectedChannels(selectedChannels: ChannelId[], availableChannels: ChannelId[]): ChannelId[] {
  const validSelectedChannels = selectedChannels.filter((channel) => availableChannels.includes(channel));
  if (validSelectedChannels.length > 0) {
    return validSelectedChannels;
  }

  const preferredChannel = availableChannels.find((channel) => channel.toLowerCase() === "fp1");
  return preferredChannel ? [preferredChannel] : availableChannels.slice(0, 1);
}

function getChannelPickerLabel(selectedChannels: ChannelId[]): string {
  if (selectedChannels.length === 0) {
    return "Channels";
  }

  if (selectedChannels.length === 1) {
    return selectedChannels[0] ?? "Channels";
  }

  return `${selectedChannels[0]} +${selectedChannels.length - 1}`;
}

function createWindowAnnotationRows(channel: ChannelId | undefined, duration: number): TimeseriesWindowAnnotationRow[] {
  const rows = [
    { id: "row-1", label: "R1", values: [] as string[], colors: [] as string[] },
    { id: "row-2", label: "R2", values: [] as string[], colors: [] as string[] },
    { id: "row-3", label: "R3", values: [] as string[], colors: [] as string[] },
  ];

  if (!channel || duration <= 0) {
    return rows;
  }

  const seed = hashChannel(channel);
  const windowCount = Math.ceil(duration / WINDOW_SIZE_SECONDS);

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
    const valueSeed = seed + windowIndex * 17;
    const confidence = 50 + (valueSeed % 49);
    const cluster = (valueSeed % 5) + 1;
    const score = valueSeed % 3;

    rows[0]?.values.push(score === 0 ? "A" : score === 1 ? "B" : "C");
    rows[0]?.colors.push(["rgb(125 211 252 / 28%)", "rgb(134 239 172 / 28%)", "rgb(249 168 212 / 28%)"][score] ?? "rgb(255 255 255 / 12%)");

    rows[1]?.values.push(String(confidence));
    rows[1]?.colors.push(confidence > 82 ? "rgb(134 239 172 / 28%)" : confidence > 66 ? "rgb(250 204 21 / 24%)" : "rgb(248 113 113 / 24%)");

    rows[2]?.values.push(`C${cluster}`);
    rows[2]?.colors.push(["rgb(196 181 253 / 28%)", "rgb(125 211 252 / 24%)", "rgb(45 212 191 / 24%)", "rgb(251 146 60 / 24%)", "rgb(244 114 182 / 24%)"][cluster - 1] ?? "rgb(255 255 255 / 12%)");
  }

  return rows;
}

function hashChannel(channel: ChannelId): number {
  return channel.split("").reduce((hash, character) => hash + character.charCodeAt(0), 0);
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
