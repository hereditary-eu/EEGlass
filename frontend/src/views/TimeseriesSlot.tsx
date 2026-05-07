import { useMemo } from "react";
import { Link } from "react-router-dom";

import { EegTimeseries } from "../components";
import type { TimeseriesWindowAnnotationRow } from "../components";
import { getAnnotationClassColor } from "../constants/eegModel";
import type { TimeseriesDataController } from "../hooks/useTimeseriesData";
import type { ChannelId, ModelClassPresentation, ModelInferenceResponse, TimeseriesSource } from "../types";
import "./TimeseriesSlot.css";

const DEFAULT_WINDOW_SIZE_SECONDS = 4;

interface TimeseriesSlotProps {
  ts: TimeseriesDataController;
}

export function TimeseriesSlot({ ts }: TimeseriesSlotProps) {
  const windowSizeSeconds = ts.inferenceResult?.window_size_seconds ?? DEFAULT_WINDOW_SIZE_SECONDS;

  const annotationChannel =
    ts.hoveredChannel && ts.activeChannels.includes(ts.hoveredChannel) ? ts.hoveredChannel : ts.activeChannels[0];
  const windowAnnotationRows = useMemo(
    () => createWindowAnnotationRows(ts.inferenceResult, ts.modelInfo?.classes ?? []),
    [ts.inferenceResult, ts.modelInfo],
  );

  return (
    <div className="timeseries-slot">
      <div className="timeseries-slot-header" aria-label="Timeseries controls">
        <div className="timeseries-slot-controls">
          <span className="timeseries-slot-id">
            {ts.datasetId} / {ts.subjectId}
          </span>
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
          {ts.isComputingInference ? <span className="timeseries-slot-status">Loading predictions</span> : null}
          {ts.isDatasetPredictionJobRunning ? (
            <span className="timeseries-slot-status">Dataset prediction job running</span>
          ) : null}
          {ts.signal && ts.error ? (
            <span className="timeseries-slot-status timeseries-slot-status--error">{ts.error}</span>
          ) : null}
          {!ts.signal && ts.error ? (
            <span className="timeseries-slot-status timeseries-slot-status--error">
              {ts.error} <Link to="/">Overview</Link>
            </span>
          ) : null}
          {ts.inferenceError ? (
            <span className="timeseries-slot-status timeseries-slot-status--error">{ts.inferenceError}</span>
          ) : null}
          <span className="timeseries-slot-status">
            {ts.signal ? (ts.signal.preview ? "Preview" : "Full") : "Idle"}
          </span>
          {ts.metadata?.subject_label ? (
            <span className="timeseries-slot-status">Subject label: {ts.metadata.subject_label}</span>
          ) : null}
          {ts.selectedTimeseriesBandFilter ? (
            <span className="timeseries-slot-status">Filter: {ts.selectedTimeseriesBandFilter}</span>
          ) : null}
          {annotationChannel ? <span className="timeseries-slot-status">Annotations: {annotationChannel}</span> : null}
          {ts.selectedPredictionWindow ? (
            <span className="timeseries-slot-status">
              Window {ts.selectedPredictionWindow.window_index + 1}: {ts.selectedPredictionWindow.start_time.toFixed(1)}
              s-
              {ts.selectedPredictionWindow.end_time.toFixed(1)}s
            </span>
          ) : null}
          <button
            type="button"
            className="timeseries-slot-button"
            onClick={ts.handleComputeInference}
            disabled={
              !ts.subjectId ||
              !ts.signal ||
              ts.activeChannels.length === 0 ||
              ts.isComputingInference ||
              ts.isDatasetPredictionJobRunning
            }
          >
            Compute
          </button>
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
          hoveredPredictionWindowIndex={ts.hoveredPredictionWindowIndex}
          onHoveredPredictionWindowIndexChange={ts.setHoveredPredictionWindowIndex}
          lockedPredictionWindowIndex={ts.lockedPredictionWindowIndex}
          onLockedPredictionWindowIndexChange={ts.setLockedPredictionWindowIndex}
          predictionWindowCount={ts.inferenceResult?.predictions.length ?? 0}
          windowSizeSeconds={windowSizeSeconds}
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
              <input type="checkbox" checked={isSelected} onChange={() => onChannelToggle(channel)} />
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

function createWindowAnnotationRows(
  inferenceResult: ModelInferenceResponse | null,
  modelClasses: ModelClassPresentation[],
): TimeseriesWindowAnnotationRow[] {
  const rows: TimeseriesWindowAnnotationRow[] = [
    { id: "class", label: "Class", values: [], colors: [], defaultColor: "rgb(226 232 240 / 65%)" },
    { id: "confidence", label: "Conf", values: [], colors: [], defaultColor: "rgb(226 232 240 / 65%)" },
    { id: "reserved", defaultColor: "rgb(226 232 240 / 65%)" },
  ];

  if (!inferenceResult) {
    return rows;
  }

  inferenceResult.predictions.forEach((prediction) => {
    rows[0].values?.push(prediction.predicted_label);
    rows[0].colors?.push(getAnnotationClassColor(prediction.predicted_label, modelClasses));
    rows[1].values?.push(`${Math.round(prediction.confidence * 100)}%`);
    rows[1].colors?.push(getConfidenceColor(prediction.confidence));
  });

  return rows;
}

function getConfidenceColor(confidence: number): string {
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  const red = Math.round(248 + (96 - 248) * clampedConfidence);
  const green = Math.round(251 + (165 - 251) * clampedConfidence);
  const blue = Math.round(253 + (250 - 253) * clampedConfidence);

  return `rgb(${red} ${green} ${blue})`;
}
