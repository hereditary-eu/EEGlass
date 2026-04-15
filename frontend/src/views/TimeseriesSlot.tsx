import { useMemo } from "react";

import { EegTimeseries } from "../components";
import type { TimeseriesWindowAnnotationRow } from "../components";
import { useTimeseriesData } from "../hooks/useTimeseriesData";
import type { ChannelId, TimeseriesSource } from "../types";
import "./TimeseriesSlot.css";

const WINDOW_SIZE_SECONDS = 2;

export function TimeseriesSlot() {
  const ts = useTimeseriesData();

  const annotationChannel =
    ts.hoveredChannel && ts.activeChannels.includes(ts.hoveredChannel) ? ts.hoveredChannel : ts.activeChannels[0];
  const windowAnnotationRows = useMemo(
    () => createWindowAnnotationRows(annotationChannel, ts.signal?.duration ?? ts.metadata?.duration ?? 0),
    [annotationChannel, ts.metadata?.duration, ts.signal?.duration],
  );

  return (
    <div className="timeseries-slot">
      <div className="timeseries-slot-header" aria-label="Timeseries controls">
        <div className="timeseries-slot-controls">
          <select
            className="timeseries-slot-select timeseries-slot-select--dataset"
            value={ts.datasetId}
            onChange={(e) => ts.handleDatasetChange(e.currentTarget.value)}
            disabled={ts.isLoadingDatasets || ts.datasets.length === 0}
            aria-label="EEG dataset"
          >
            {ts.datasets.length === 0 ? <option value={ts.datasetId}>{ts.datasetId}</option> : null}
            {ts.datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.id}
              </option>
            ))}
          </select>
          <select
            className="timeseries-slot-select timeseries-slot-select--subject"
            value={ts.subjectId}
            onChange={(e) => ts.handleSubjectChange(e.currentTarget.value)}
            disabled={ts.isLoadingSubjects || ts.subjects.length === 0}
            aria-label="EEG subject"
          >
            {ts.subjects.length === 0 ? <option value={ts.subjectId}>{ts.subjectId || "Subject"}</option> : null}
            {ts.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.id}
              </option>
            ))}
          </select>
          <ChannelMultiSelect
            channels={ts.availableChannels}
            selectedChannels={ts.activeChannels}
            disabled={ts.availableChannels.length === 0}
            onChannelToggle={ts.handleChannelToggle}
          />
          <select
            className="timeseries-slot-select"
            value={ts.source}
            onChange={(e) => ts.handleSourceChange(e.currentTarget.value as TimeseriesSource)}
            aria-label="EEG source"
          >
            {ts.sourceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="timeseries-slot-actions">
          {ts.isLoadingDatasets ? <span className="timeseries-slot-status">Loading datasets</span> : null}
          {ts.isLoadingSubjects ? <span className="timeseries-slot-status">Loading subjects</span> : null}
          {ts.isRefreshingFullSignal ? <span className="timeseries-slot-status">Loading full signal</span> : null}
          {ts.signal && ts.error ? (
            <span className="timeseries-slot-status timeseries-slot-status--error">{ts.error}</span>
          ) : null}
          <span className="timeseries-slot-status">
            {ts.signal ? (ts.signal.preview ? "Preview" : "Full") : "Idle"}
          </span>
          {annotationChannel ? <span className="timeseries-slot-status">Annotations: {annotationChannel}</span> : null}
          <button type="button" className="timeseries-slot-button" onClick={ts.handleResetView}>
            Reset view
          </button>
          {ts.selectedTimeRange ? (
            <button type="button" className="timeseries-slot-button" onClick={() => ts.setSelectedTimeRange(null)}>
              Clear range
            </button>
          ) : null}
        </div>
      </div>

      <div className="timeseries-slot-canvas">
        <EegTimeseries
          samples={ts.signal?.samples ?? {}}
          samplingFrequency={ts.samplingFrequency}
          channels={ts.signal?.channels ?? ts.activeChannels}
          selectedTimeRange={ts.selectedTimeRange}
          onSelectedTimeRangeChange={ts.setSelectedTimeRange}
          resetViewSignal={ts.resetViewSignal}
          hoveredChannel={ts.hoveredChannel}
          onHoveredChannelChange={ts.setHoveredChannel}
          windowSizeSeconds={WINDOW_SIZE_SECONDS}
          windowAnnotationRows={windowAnnotationRows}
          isPreview={ts.signal?.preview ?? true}
          isLoading={ts.isLoading}
          error={ts.signal ? null : ts.error}
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
    { id: "class", label: "Class", values: [] as string[], colors: [] as string[] },
    { id: "score", label: "Score", values: [] as string[], colors: [] as string[] },
    { id: "cluster", label: "Cluster", values: [] as string[], colors: [] as string[] },
  ];

  if (!channel || duration <= 0) {
    return rows;
  }

  const seed = hashChannel(channel);
  const windowCount = Math.ceil(duration / WINDOW_SIZE_SECONDS);

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
    const valueSeed = seed + windowIndex * 17;
    const confidence = 50 + (valueSeed % 49);
    const cluster = (valueSeed % 4) + 1;
    const classIndex = valueSeed % 3;

    rows[0]?.values.push(["A", "B", "C"][classIndex] ?? "A");
    rows[0]?.colors.push(
      ["rgb(14 116 144 / 18%)", "rgb(21 128 61 / 18%)", "rgb(190 24 93 / 16%)"][classIndex] ??
        "rgb(23 33 43 / 8%)",
    );

    rows[1]?.values.push(String(confidence));
    rows[1]?.colors.push(
      confidence > 82 ? "rgb(21 128 61 / 18%)" : confidence > 66 ? "rgb(217 119 6 / 18%)" : "rgb(220 38 38 / 16%)",
    );

    rows[2]?.values.push(`C${cluster}`);
    rows[2]?.colors.push(
      ["rgb(109 40 217 / 16%)", "rgb(14 116 144 / 16%)", "rgb(13 148 136 / 16%)", "rgb(217 119 6 / 16%)"][
        cluster - 1
      ] ?? "rgb(23 33 43 / 8%)",
    );
  }

  return rows;
}

function hashChannel(channel: ChannelId): number {
  return channel.split("").reduce((hash, character) => hash + character.charCodeAt(0), 0);
}
