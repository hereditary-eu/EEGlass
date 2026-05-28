import type {
  VacpActionDescriptor,
  VacpCapabilitiesSnapshot,
  VacpRef,
  VacpStateSnapshot,
} from "@vacp/core";
import { nowIso, VACP_SCHEMA_VERSION } from "@vacp/core";
import { installVacpRuntimeBridge, VacpActionRegistry } from "@vacp/gateway";

import type { ChannelId, ModelInferenceResponse, TimeseriesSource } from "../types";
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
      required: Object.keys(properties),
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
