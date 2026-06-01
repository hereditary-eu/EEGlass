import { useMemo } from "react";
import { Link } from "react-router-dom";

import { ComponentStatusIndicator, EegTimeseries, MathFormula } from "../components";
import type { TimeseriesWindowAnnotationRow, TimeseriesWindowAnnotationValue } from "../components";
import { getAnnotationClassColor } from "../constants/eegModel";
import { EEG_MODEL_NOTATION, EEG_MODEL_NOTATION_LABELS } from "../constants/eegModelNotation";
import type { TimeseriesDataController } from "../hooks/useTimeseriesData";
import type { ChannelId, ModelClassPresentation, ModelInferenceResponse, TimeseriesSource } from "../types";
import "./TimeseriesSlot.css";

const DEFAULT_WINDOW_SIZE_SECONDS = 4;
const DEFAULT_WINDOW_ANNOTATION_COLOR = "rgb(226 232 240 / 65%)";

type PredictionWindow = ModelInferenceResponse["predictions"][number];

interface WindowAnnotationRowDefinition {
  id: string;
  label?: string;
  defaultColor?: string;
  getValue?: (prediction: PredictionWindow) => TimeseriesWindowAnnotationValue;
  getColor?: (prediction: PredictionWindow, modelClasses: ModelClassPresentation[]) => string | null;
}

const WINDOW_ANNOTATION_ROW_DEFINITIONS: WindowAnnotationRowDefinition[] = [
  {
    id: "class",
    label: "Class",
    getValue: (prediction) => prediction.predicted_label,
    getColor: (prediction, modelClasses) => getAnnotationClassColor(prediction.predicted_label, modelClasses),
  },
  {
    id: "confidence",
    label: "Conf",
    getValue: (prediction) => `${Math.round(prediction.confidence * 100)}%`,
    getColor: (prediction) => getConfidenceColor(prediction.confidence),
  },
  // { id: "reserved" },
];

interface TimeseriesSlotProps {
  ts: TimeseriesDataController;
}

export function TimeseriesSlot({ ts }: TimeseriesSlotProps) {
  const windowSizeSeconds = ts.inferenceResult?.window_size_seconds ?? DEFAULT_WINDOW_SIZE_SECONDS;

  const windowAnnotationRows = useMemo(
    () => createWindowAnnotationRows(ts.inferenceResult, ts.modelInfo?.classes ?? []),
    [ts.inferenceResult, ts.modelInfo?.classes],
  );
  const status = getTimeseriesStatus(ts);

  return (
    <div className="timeseries-slot">
      <div className="timeseries-slot-header" aria-label="Timeseries controls">
        <div className="timeseries-slot-left">
          <div className="timeseries-slot-heading">
            <div>
              <h3 className="timeseries-slot-title">Input signal</h3>
              <p className="timeseries-slot-subtitle">
                {ts.selectedPredictionWindow
                  ? `Window ${ts.selectedPredictionWindow.window_index + 1}: ${ts.selectedPredictionWindow.start_time.toFixed(1)}s-${ts.selectedPredictionWindow.end_time.toFixed(1)}s`
                  : "Select a prediction window to inspect this EEG slice"}
              </p>
            </div>
          </div>
          <div className="timeseries-slot-controls">
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
        </div>

        <div className="timeseries-slot-right">
          <p className="timeseries-slot-model-stage">
            {EEG_MODEL_NOTATION_LABELS.inputLayer} <MathFormula tex={EEG_MODEL_NOTATION.inputWindow} />
            <ComponentStatusIndicator status={status.status} label={status.label} />
          </p>
          <div className="timeseries-slot-actions">
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
            {ts.signal?.preview ? <span className="timeseries-slot-status">Preview</span> : null}
            {!ts.signal ? <span className="timeseries-slot-status">Idle</span> : null}
            {ts.selectedTimeseriesBandFilter ? (
              <span className="timeseries-slot-status">Filter: {ts.selectedTimeseriesBandFilter}</span>
            ) : null}
            <button
              type="button"
              className="timeseries-slot-button"
              onClick={ts.handleComputeInference}
              disabled={
                !ts.subjectId ||
                !ts.modelInfo ||
                !ts.signal ||
                ts.activeChannels.length === 0 ||
                ts.isComputingInference ||
                ts.isDatasetPredictionJobRunning
              }
            >
              Compute
            </button>
            {ts.selectedTimeRange ? (
              <button type="button" className="timeseries-slot-button" onClick={() => ts.setSelectedTimeRange(null)}>
                Clear range
              </button>
            ) : null}
          </div>
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
          showStatusOverlay={false}
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
  const predictions = inferenceResult?.predictions ?? [];

  return WINDOW_ANNOTATION_ROW_DEFINITIONS.map((definition) =>
    createWindowAnnotationRow(definition, predictions, modelClasses),
  );
}

function createWindowAnnotationRow(
  definition: WindowAnnotationRowDefinition,
  predictions: PredictionWindow[],
  modelClasses: ModelClassPresentation[],
): TimeseriesWindowAnnotationRow {
  const values = definition.getValue ? predictions.map(definition.getValue) : undefined;
  const colors = definition.getColor
    ? predictions.map((prediction) => definition.getColor?.(prediction, modelClasses) ?? null)
    : undefined;

  return {
    id: definition.id,
    label: definition.label,
    values,
    colors,
    defaultColor: definition.defaultColor ?? DEFAULT_WINDOW_ANNOTATION_COLOR,
  };
}

function getConfidenceColor(confidence: number): string {
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  const red = Math.round(248 + (96 - 248) * clampedConfidence);
  const green = Math.round(251 + (165 - 251) * clampedConfidence);
  const blue = Math.round(253 + (250 - 253) * clampedConfidence);

  return `rgb(${red} ${green} ${blue})`;
}

function getTimeseriesStatus(ts: TimeseriesDataController): {
  status: "idle" | "loading" | "loaded" | "error";
  label: string;
} {
  if (ts.error || ts.inferenceError) {
    return { status: "error", label: ts.error ?? ts.inferenceError ?? "Unable to load input signal." };
  }

  if (
    ts.isLoadingDatasets ||
    ts.isLoadingSubjects ||
    ts.isRefreshingFullSignal ||
    ts.isComputingInference ||
    ts.isLoading
  ) {
    return { status: "loading", label: getTimeseriesLoadingLabel(ts) };
  }

  if (ts.signal) {
    return { status: "loaded", label: "Input signal loaded" };
  }

  return { status: "idle", label: "Input signal idle" };
}

function getTimeseriesLoadingLabel(ts: TimeseriesDataController): string {
  if (ts.isComputingInference) {
    return "Loading predictions";
  }

  if (ts.isRefreshingFullSignal || ts.isLoading) {
    return "Loading signal";
  }

  if (ts.isLoadingSubjects) {
    return "Loading subjects";
  }

  return "Loading datasets";
}
