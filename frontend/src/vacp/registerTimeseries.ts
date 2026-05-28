import type {
  VacpActionDescriptor,
  VacpCapabilitiesSnapshot,
  VacpRef,
  VacpStateSnapshot,
} from "@vacp/core";
import { nowIso, VACP_SCHEMA_VERSION } from "@vacp/core";
import { installVacpRuntimeBridge, VacpActionRegistry } from "@vacp/gateway";

import type { ChannelId, ModelClassPresentation, ModelInferenceResponse, TimeseriesSource } from "../types";
import {
  createPrivateVacpGlobalKey,
  createVacpChartRefPrefix,
  registerVacpChart,
  VACP_APP_ID,
  VACP_APP_REF,
} from "./appBridge";

interface RegisterVacpTimeseriesArgs {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  modelClasses: ModelClassPresentation[];
  availableChannels: ChannelId[];
  activeChannels: ChannelId[];
  hoveredChannel: ChannelId | null;
  inferenceResult: ModelInferenceResponse | null;
  hoveredPredictionWindowIndex: number | null;
  lockedPredictionWindowIndex: number | null;
  selectedPredictionWindowIndex: number | null;
  selectChannel: (channel: ChannelId) => void;
  selectWindow: (windowIndex: number) => void;
}

const TIMESERIES_CHART_ID = "patient-view/timeseries";
const TIMESERIES_ACTIONS = {
  channelNext: "patient_view.timeseries.channel_next",
  channelPrevious: "patient_view.timeseries.channel_previous",
  channelSet: "patient_view.timeseries.channel_set",
  windowNext: "patient_view.timeseries.window_next",
  windowPrevious: "patient_view.timeseries.window_previous",
  windowSet: "patient_view.timeseries.window_set",
  windowSelectByPrediction: "patient_view.timeseries.window_select_by_prediction",
} as const;

export function registerVacpTimeseries(args: RegisterVacpTimeseriesArgs): () => void {
  const refPrefix = createVacpChartRefPrefix(TIMESERIES_CHART_ID);
  const channelRef = `${refPrefix}/channel` as VacpRef;
  const windowRef = `${refPrefix}/window` as VacpRef;
  const globalKey = createPrivateVacpGlobalKey(TIMESERIES_CHART_ID);
  const actions = new VacpActionRegistry();

  actions.register(
    createActionDescriptor(TIMESERIES_ACTIONS.channelNext, channelRef, "Select the next EEG channel."),
    () => {
      const channel = getRelativeChannel(args, 1);
      if (!channel) return { channel: null, found: false };
      args.selectChannel(channel);
      return { channel, found: true };
    },
  );

  actions.register(
    createActionDescriptor(TIMESERIES_ACTIONS.channelPrevious, channelRef, "Select the previous EEG channel."),
    () => {
      const channel = getRelativeChannel(args, -1);
      if (!channel) return { channel: null, found: false };
      args.selectChannel(channel);
      return { channel, found: true };
    },
  );

  actions.register(
    createActionDescriptor(TIMESERIES_ACTIONS.channelSet, channelRef, "Select a specific EEG channel.", {
      channel: { type: "string" },
    }),
    (params) => {
      const channel = getChannelParam(params);
      if (!channel || !args.availableChannels.includes(channel)) return { channel, found: false };
      args.selectChannel(channel);
      return { channel, found: true };
    },
  );

  actions.register(
    createActionDescriptor(TIMESERIES_ACTIONS.windowNext, windowRef, "Select the next prediction window."),
    () => {
      const windowIndex = getRelativeWindowIndex(args, 1);
      if (windowIndex === null) return { windowIndex: null, found: false };
      args.selectWindow(windowIndex);
      return { windowIndex, found: true };
    },
  );

  actions.register(
    createActionDescriptor(TIMESERIES_ACTIONS.windowPrevious, windowRef, "Select the previous prediction window."),
    () => {
      const windowIndex = getRelativeWindowIndex(args, -1);
      if (windowIndex === null) return { windowIndex: null, found: false };
      args.selectWindow(windowIndex);
      return { windowIndex, found: true };
    },
  );

  actions.register(
    createActionDescriptor(TIMESERIES_ACTIONS.windowSet, windowRef, "Select a prediction window by zero-based index.", {
      windowIndex: { type: "integer", minimum: 0 },
    }),
    (params) => {
      const windowIndex = getWindowIndexParam(params);
      if (windowIndex === null || !isValidWindowIndex(args, windowIndex)) return { windowIndex, found: false };
      args.selectWindow(windowIndex);
      return { windowIndex, found: true };
    },
  );

  actions.register(
    createActionDescriptor(
      TIMESERIES_ACTIONS.windowSelectByPrediction,
      windowRef,
      "Select a prediction window by predicted label and confidence preference.",
      {
        predictedLabel: { type: "string", enum: getPredictionLabelOptions(args) },
        confidencePreference: { type: "string", enum: ["highest", "lowest", "first", "next", "previous"] },
        minConfidence: { type: "number", minimum: 0, maximum: 1 },
      },
      ["predictedLabel"],
    ),
    (params) => {
      const selection = selectWindowByPrediction(args, params);
      if (!selection.found) return selection;
      args.selectWindow(selection.windowIndex);
      return selection;
    },
  );

  const bridge = installVacpRuntimeBridge({
    globalKey,
    sessionKey: `${VACP_APP_ID}:${TIMESERIES_CHART_ID}`,
    actions,
    snapshots: {
      getCapabilities: () => buildCapabilitiesSnapshot(args, refPrefix, channelRef, windowRef),
      getState: () => buildStateSnapshot(args, refPrefix, channelRef, windowRef),
    },
  });

  return registerVacpChart({
    id: TIMESERIES_CHART_ID,
    title: "Patient View Timeseries",
    refPrefix,
    globalKey,
    bridge,
  });
}

function buildCapabilitiesSnapshot(
  args: RegisterVacpTimeseriesArgs,
  refPrefix: VacpRef,
  channelRef: VacpRef,
  windowRef: VacpRef,
): VacpCapabilitiesSnapshot {
  const windowCount = args.inferenceResult?.predictions.length ?? 0;
  return {
    version: VACP_SCHEMA_VERSION,
    createdAt: nowIso(),
    graph: {
      version: VACP_SCHEMA_VERSION,
      nodes: [
        {
          ref: refPrefix,
          kind: "Visualization",
          layer: "VisualizationLayer",
          title: "Patient View Timeseries",
          description: "EEG timeseries signal with selectable channels and prediction windows.",
          data: {
            datasetId: args.datasetId,
            subjectId: args.subjectId,
            source: args.source,
            availableChannels: args.availableChannels,
            windowCount,
            predictedLabels: getPredictionLabelOptions(args),
          },
        },
        {
          ref: channelRef,
          kind: "Selection",
          layer: "InteractionFeedbackLayer",
          title: "Selected EEG channel",
        },
        {
          ref: windowRef,
          kind: "Selection",
          layer: "InteractionFeedbackLayer",
          title: "Selected prediction window",
        },
      ],
      edges: [
        { from: VACP_APP_REF, to: refPrefix, kind: "contains" },
        { from: refPrefix, to: channelRef, kind: "contains" },
        { from: refPrefix, to: windowRef, kind: "contains" },
      ],
      actions: [
        createActionDescriptor(TIMESERIES_ACTIONS.channelNext, channelRef, "Select the next EEG channel."),
        createActionDescriptor(TIMESERIES_ACTIONS.channelPrevious, channelRef, "Select the previous EEG channel."),
        createActionDescriptor(TIMESERIES_ACTIONS.channelSet, channelRef, "Select a specific EEG channel.", {
          channel: { type: "string", enum: args.availableChannels },
        }),
        createActionDescriptor(TIMESERIES_ACTIONS.windowNext, windowRef, "Select the next prediction window."),
        createActionDescriptor(TIMESERIES_ACTIONS.windowPrevious, windowRef, "Select the previous prediction window."),
        createActionDescriptor(
          TIMESERIES_ACTIONS.windowSet,
          windowRef,
          "Select a prediction window by zero-based index.",
          { windowIndex: { type: "integer", minimum: 0, maximum: Math.max(0, windowCount - 1) } },
        ),
        createActionDescriptor(
          TIMESERIES_ACTIONS.windowSelectByPrediction,
          windowRef,
          "Select a prediction window by predicted label and confidence preference.",
          {
            predictedLabel: { type: "string", enum: getPredictionLabelOptions(args) },
            confidencePreference: { type: "string", enum: ["highest", "lowest", "first", "next", "previous"] },
            minConfidence: { type: "number", minimum: 0, maximum: 1 },
          },
          ["predictedLabel"],
        ),
      ],
    },
  };
}

function buildStateSnapshot(
  args: RegisterVacpTimeseriesArgs,
  refPrefix: VacpRef,
  channelRef: VacpRef,
  windowRef: VacpRef,
): VacpStateSnapshot {
  const windows = args.inferenceResult?.predictions ?? [];
  const selectedWindow =
    args.lockedPredictionWindowIndex === null ? null : (windows[args.lockedPredictionWindowIndex] ?? null);

  return {
    version: VACP_SCHEMA_VERSION,
    createdAt: nowIso(),
    state: {
      [refPrefix]: {
        datasetId: args.datasetId,
        subjectId: args.subjectId,
        source: args.source,
        activeChannels: args.activeChannels,
        availableChannels: args.availableChannels,
        hoveredChannel: args.hoveredChannel,
        windowCount: windows.length,
        predictedLabels: getPredictionLabelOptions(args),
        hoveredPredictionWindowIndex: args.hoveredPredictionWindowIndex,
        lockedPredictionWindowIndex: args.lockedPredictionWindowIndex,
        selectedPredictionWindowIndex: args.selectedPredictionWindowIndex,
        selectedWindow: selectedWindow
          ? {
              windowIndex: selectedWindow.window_index,
              startTime: selectedWindow.start_time,
              endTime: selectedWindow.end_time,
              predictedLabel: selectedWindow.predicted_label,
              confidence: selectedWindow.confidence,
            }
          : null,
      },
      [channelRef]: { activeChannels: args.activeChannels, hoveredChannel: args.hoveredChannel },
      [windowRef]: {
        lockedPredictionWindowIndex: args.lockedPredictionWindowIndex,
        hoveredPredictionWindowIndex: args.hoveredPredictionWindowIndex,
      },
    },
    summary: {
      [refPrefix]: `${args.subjectId} ${args.source}; channel=${args.activeChannels[0] ?? "none"}; window=${
        args.lockedPredictionWindowIndex === null ? "none" : args.lockedPredictionWindowIndex + 1
      }/${windows.length || 0}.`,
    },
  };
}

function createActionDescriptor(
  name: string,
  targetRef: VacpRef,
  description: string,
  properties: Record<string, unknown> = {},
  required = Object.keys(properties),
): VacpActionDescriptor {
  return {
    name,
    targetRef,
    title: name.replace(/^patient_view\.timeseries\./, "").replace(/_/g, " "),
    description,
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", const: targetRef },
        ...properties,
      },
      required,
    },
  };
}

function getRelativeChannel(args: RegisterVacpTimeseriesArgs, direction: 1 | -1): ChannelId | null {
  const channels = args.availableChannels;
  if (!channels.length) return null;
  const current = args.activeChannels[0] ?? null;
  const currentIndex = current ? channels.indexOf(current) : -1;
  const nextIndex = (currentIndex + direction + channels.length) % channels.length;
  return channels[nextIndex] ?? null;
}

function getRelativeWindowIndex(args: RegisterVacpTimeseriesArgs, direction: 1 | -1): number | null {
  const windowCount = args.inferenceResult?.predictions.length ?? 0;
  if (!windowCount) return null;
  const current = args.lockedPredictionWindowIndex ?? -1;
  return Math.max(0, Math.min(windowCount - 1, current + direction));
}

function isValidWindowIndex(args: RegisterVacpTimeseriesArgs, windowIndex: number): boolean {
  const windowCount = args.inferenceResult?.predictions.length ?? 0;
  return Number.isInteger(windowIndex) && windowIndex >= 0 && windowIndex < windowCount;
}

function selectWindowByPrediction(
  args: RegisterVacpTimeseriesArgs,
  params: unknown,
):
  | {
      found: true;
      windowIndex: number;
      predictedLabel: string;
      confidence: number;
      matchedWindows: number;
      confidencePreference: string;
    }
  | { found: false; predictedLabel: string | null; matchedWindows: number; reason: string } {
  const request = getPredictionSelectionParams(params);
  if (!request.predictedLabel) {
    return { found: false, predictedLabel: null, matchedWindows: 0, reason: "missing predictedLabel" };
  }

  const windows = args.inferenceResult?.predictions ?? [];
  const matchingLabels = getMatchingPredictionLabels(args, request.predictedLabel);
  if (!matchingLabels.length) {
    return { found: false, predictedLabel: request.predictedLabel, matchedWindows: 0, reason: "unknown label" };
  }

  const minConfidence = request.minConfidence ?? 0;
  const labelCandidates = windows.filter((window) => matchingLabels.includes(window.predicted_label));
  const candidates = labelCandidates.filter((window) => window.confidence >= minConfidence);
  if (!candidates.length) {
    return {
      found: false,
      predictedLabel: request.predictedLabel,
      matchedWindows: labelCandidates.length,
      reason: "no matching windows above confidence threshold",
    };
  }

  const selectedWindow = pickPredictionWindow(candidates, args.lockedPredictionWindowIndex, request.confidencePreference);
  return {
    found: true,
    windowIndex: selectedWindow.window_index,
    predictedLabel: selectedWindow.predicted_label,
    confidence: selectedWindow.confidence,
    matchedWindows: candidates.length,
    confidencePreference: request.confidencePreference,
  };
}

function pickPredictionWindow(
  windows: ModelInferenceResponse["predictions"],
  currentWindowIndex: number | null,
  confidencePreference: string,
): ModelInferenceResponse["predictions"][number] {
  if (confidencePreference === "lowest") {
    return windows.reduce((best, window) => (window.confidence < best.confidence ? window : best), windows[0]);
  }

  if (confidencePreference === "first") {
    return windows[0];
  }

  if (confidencePreference === "next") {
    const next = windows.find((window) => window.window_index > (currentWindowIndex ?? -1));
    return next ?? windows[0];
  }

  if (confidencePreference === "previous") {
    const previous = [...windows].reverse().find((window) => window.window_index < (currentWindowIndex ?? Infinity));
    return previous ?? windows[windows.length - 1];
  }

  return windows.reduce((best, window) => (window.confidence > best.confidence ? window : best), windows[0]);
}

function getChannelParam(params: unknown): ChannelId | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const channel = (params as { channel?: unknown }).channel;
  return typeof channel === "string" && channel.length ? channel : null;
}

function getWindowIndexParam(params: unknown): number | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const windowIndex = (params as { windowIndex?: unknown }).windowIndex;
  return typeof windowIndex === "number" && Number.isInteger(windowIndex) ? windowIndex : null;
}

function getPredictionSelectionParams(params: unknown): {
  predictedLabel: string | null;
  confidencePreference: string;
  minConfidence: number | null;
} {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return { predictedLabel: null, confidencePreference: "highest", minConfidence: null };
  }

  const raw = params as {
    predictedLabel?: unknown;
    label?: unknown;
    confidencePreference?: unknown;
    confidence?: unknown;
    minConfidence?: unknown;
  };
  const predictedLabel =
    typeof raw.predictedLabel === "string" && raw.predictedLabel.length
      ? raw.predictedLabel
      : typeof raw.label === "string" && raw.label.length
        ? raw.label
        : null;
  const confidencePreference = normalizeConfidencePreference(raw.confidencePreference ?? raw.confidence);
  const minConfidence = typeof raw.minConfidence === "number" ? Math.max(0, Math.min(1, raw.minConfidence)) : null;
  return { predictedLabel, confidencePreference, minConfidence };
}

function normalizeConfidencePreference(value: unknown): string {
  if (typeof value !== "string") return "highest";
  const normalized = value.trim().toLowerCase();
  if (normalized === "lowest" || normalized === "low") return "lowest";
  if (normalized === "first") return "first";
  if (normalized === "next") return "next";
  if (normalized === "previous" || normalized === "prev") return "previous";
  return "highest";
}

function getPredictionLabelOptions(args: RegisterVacpTimeseriesArgs): string[] {
  const labels = new Set<string>();
  args.modelClasses.forEach((modelClass) => {
    labels.add(modelClass.label);
    labels.add(modelClass.compact_label);
  });
  args.inferenceResult?.predictions.forEach((prediction) => labels.add(prediction.predicted_label));
  return Array.from(labels).filter(Boolean);
}

function getMatchingPredictionLabels(args: RegisterVacpTimeseriesArgs, requestedLabel: string): string[] {
  const normalizedRequest = normalizeLabel(requestedLabel);
  const exactMatches = args.modelClasses
    .filter(
      (modelClass) =>
        normalizeLabel(modelClass.label) === normalizedRequest ||
        normalizeLabel(modelClass.compact_label) === normalizedRequest,
    )
    .map((modelClass) => modelClass.label);
  if (exactMatches.length) return exactMatches;

  const predictionLabels = Array.from(
    new Set(args.inferenceResult?.predictions.map((prediction) => prediction.predicted_label) ?? []),
  );
  const directPredictionMatches = predictionLabels.filter((label) => normalizeLabel(label) === normalizedRequest);
  if (directPredictionMatches.length) return directPredictionMatches;

  const substringMatches = predictionLabels.filter((label) => normalizeLabel(label).includes(normalizedRequest));
  if (substringMatches.length) return substringMatches;

  return args.modelClasses
    .filter((modelClass) => levenshteinDistance(normalizeLabel(modelClass.compact_label), normalizedRequest) <= 1)
    .map((modelClass) => modelClass.label);
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1]
          : Math.min(previous[j - 1] + 1, previous[j] + 1, current[j - 1] + 1);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}
