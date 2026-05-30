import type {
  VacpActionCall,
  VacpActionDescriptor,
  VacpActionResult,
  VacpCapabilitiesSnapshot,
  VacpGraph,
  VacpRef,
  VacpRuntimeBridge,
  VacpStateSnapshot,
} from "@vacp/core";
import { nowIso, VACP_APPLY_STATE_ACTION, VACP_SCHEMA_VERSION } from "@vacp/core";
import { installVacpRuntimeBridge, VacpActionRegistry } from "@vacp/gateway";

export const VACP_APP_ID = "all-in-one-eeg";
export const VACP_APP_REF = `vacp://${VACP_APP_ID}` as VacpRef;

export interface RegisteredVacpChart {
  id: string;
  title: string;
  refPrefix: VacpRef;
  globalKey: string;
  bridge: VacpRuntimeBridge;
}

const ACTION_NAMES = [
  "vega_lite.set_param",
  "vega_lite.set_selection",
  "vega_lite.clear_selection",
  "vega_lite.hover_tooltip",
  "vega.set_signal",
  "overview.patient_list.focus_next",
  "overview.patient_list.focus_previous",
  "overview.patient_list.focus_subject",
  "overview.patient_list.toggle_focused",
  "overview.patient_list.toggle_subject",
  "overview.patient_list.open_focused",
  "overview.patient_list.open_subject",
  "patient_view.navigate_back",
  "patient_view.timeseries.channel_next",
  "patient_view.timeseries.channel_previous",
  "patient_view.timeseries.channel_set",
  "patient_view.timeseries.window_next",
  "patient_view.timeseries.window_previous",
  "patient_view.timeseries.window_set",
  "patient_view.timeseries.window_select_by_prediction",
  "patient_view.total_band_power.channel_next",
  "patient_view.total_band_power.channel_previous",
  "patient_view.total_band_power.channel_set",
  "patient_view.total_band_power.window_next",
  "patient_view.total_band_power.window_previous",
  "patient_view.total_band_power.window_set",
  "patient_view.scalp_view.band_next",
  "patient_view.scalp_view.band_previous",
  "patient_view.scalp_view.band_set",
  "patient_view.scalp_view.timeseries_click_filter_select",
  "patient_view.scalp_view.timeseries_click_filter_deselect",
  VACP_APPLY_STATE_ACTION,
] as const;

const charts = new Map<string, RegisteredVacpChart>();
let appBridge: VacpRuntimeBridge | null = null;

export function ensureVacpAppBridge(): VacpRuntimeBridge {
  if (appBridge) return appBridge;

  const actions = new VacpActionRegistry();
  ACTION_NAMES.forEach((name) => {
    actions.register(createRoutedActionDescriptor(name), async (params) => {
      const result = await executeRoutedAction({
        callId: createCallId(),
        name,
        params,
      });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.result;
    });
  });

  appBridge = installVacpRuntimeBridge({
    globalKey: "__vacp",
    sessionKey: VACP_APP_ID,
    actions,
    snapshots: {
      getCapabilities: buildCapabilitiesSnapshot,
      getState: buildStateSnapshot,
    },
  });

  return appBridge;
}

export function registerVacpChart(chart: RegisteredVacpChart): () => void {
  ensureVacpAppBridge();
  charts.set(chart.id, chart);
  refreshVacpAppBridge("chart registered");

  return () => {
    const current = charts.get(chart.id);
    if (current?.bridge !== chart.bridge) return;

    charts.delete(chart.id);
    removeWindowGlobal(chart.globalKey);
    refreshVacpAppBridge("chart unregistered");
  };
}

export function createVacpChartRefPrefix(chartId: string): VacpRef {
  return `vacp://${VACP_APP_ID}/${normalizeChartId(chartId)}` as VacpRef;
}

export function createPrivateVacpGlobalKey(chartId: string): string {
  return `__vacp_${normalizeChartId(chartId).replace(/[^a-zA-Z0-9_]+/g, "_")}`;
}

function normalizeChartId(chartId: string): string {
  return chartId
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
}

async function buildCapabilitiesSnapshot(): Promise<VacpCapabilitiesSnapshot> {
  const graph: VacpGraph = {
    version: VACP_SCHEMA_VERSION,
    nodes: [
      {
        ref: VACP_APP_REF,
        kind: "App",
        layer: "ViewLayer",
        title: "All-in-one EEG",
        description: "Aggregated VACP bridge for the application.",
      },
    ],
    edges: [],
    actions: [],
  };

  const seenNodes = new Set<string>(graph.nodes.map((node) => node.ref));
  const seenEdges = new Set<string>();
  const seenActions = new Set<string>();

  for (const chart of charts.values()) {
    const capabilities = await chart.bridge.getCapabilities().catch(() => null);
    if (!capabilities) continue;

    capabilities.graph.nodes.forEach((node) => {
      if (seenNodes.has(node.ref)) return;
      seenNodes.add(node.ref);
      graph.nodes.push(node);
    });

    capabilities.graph.edges.forEach((edge) => {
      const key = `${edge.from}|${edge.kind}|${edge.to}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      graph.edges.push(edge);
    });

    capabilities.graph.actions.forEach((action) => {
      const key = `${action.name}|${action.targetRef ?? ""}`;
      if (seenActions.has(key)) return;
      seenActions.add(key);
      graph.actions.push(action);
    });

    const rootNode = capabilities.graph.nodes.find((node) => node.ref === chart.refPrefix);
    if (rootNode) {
      const key = `${VACP_APP_REF}|contains|${chart.refPrefix}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        graph.edges.push({ from: VACP_APP_REF, to: chart.refPrefix, kind: "contains" });
      }
    }
  }

  return { version: VACP_SCHEMA_VERSION, createdAt: nowIso(), graph };
}

async function buildStateSnapshot(): Promise<VacpStateSnapshot> {
  const state: VacpStateSnapshot["state"] = {};
  const summary: NonNullable<VacpStateSnapshot["summary"]> = {};

  for (const chart of charts.values()) {
    const chartState = await chart.bridge.getState().catch(() => null);
    if (!chartState || !("state" in chartState)) continue;
    Object.assign(state, chartState.state);
    if (chartState.summary) Object.assign(summary, chartState.summary);
  }

  return {
    version: VACP_SCHEMA_VERSION,
    createdAt: nowIso(),
    state,
    ...(Object.keys(summary).length ? { summary } : {}),
  };
}

async function executeRoutedAction(call: VacpActionCall): Promise<VacpActionResult> {
  if (call.name === VACP_APPLY_STATE_ACTION) {
    return executeApplyState(call);
  }

  const chart = await findTargetChart(call);
  if (!chart) {
    return {
      callId: call.callId,
      ok: false,
      error: { message: `Could not route VACP action "${call.name}" to a registered chart.` },
    };
  }

  return chart.bridge.execute({ ...call, callId: createCallId() });
}

async function executeApplyState(call: VacpActionCall): Promise<VacpActionResult> {
  const params = isRecord(call.params) ? call.params : {};
  const requestedState = isRecord(params.state) ? params.state : null;
  if (!requestedState) {
    return {
      callId: call.callId,
      ok: false,
      error: { message: "Expected params.state to be an object keyed by VACP refs." },
    };
  }

  const stateByChart = new Map<RegisteredVacpChart, Record<string, unknown>>();
  for (const [ref, value] of Object.entries(requestedState)) {
    const chart = findChartByRef(ref);
    if (!chart) continue;
    const chartState = stateByChart.get(chart) ?? {};
    chartState[ref] = value;
    stateByChart.set(chart, chartState);
  }

  const results = [];
  for (const [chart, state] of stateByChart) {
    results.push(
      await chart.bridge.execute({
        callId: createCallId(),
        name: VACP_APPLY_STATE_ACTION,
        params: { state },
      }),
    );
  }

  const failed = results.find((result) => !result.ok);
  if (failed && !failed.ok) {
    return { callId: call.callId, ok: false, error: failed.error };
  }

  return { callId: call.callId, ok: true, result: { charts: results.length, results } };
}

async function findTargetChart(call: VacpActionCall): Promise<RegisteredVacpChart | null> {
  const params = isRecord(call.params) ? call.params : {};
  const ref = typeof params.ref === "string" ? params.ref : null;
  if (ref) return findChartByRef(ref);

  const capabilities = await Promise.all(
    Array.from(charts.values()).map(async (chart) => ({
      chart,
      capabilities: await chart.bridge.getCapabilities().catch(() => null),
    })),
  );

  const matches = capabilities.filter(({ capabilities: snapshot }) =>
    snapshot?.graph.actions.some((action) => action.name === call.name),
  );
  return matches.length === 1 ? matches[0].chart : null;
}

function findChartByRef(ref: string): RegisteredVacpChart | null {
  for (const chart of charts.values()) {
    if (ref === chart.refPrefix || ref.startsWith(`${chart.refPrefix}/`)) return chart;
  }
  return null;
}

function createRoutedActionDescriptor(name: string): VacpActionDescriptor {
  return {
    name,
    description: `Route ${name} to the registered VACP chart targeted by the action parameters.`,
    parameters: { type: "object" },
  };
}

function refreshVacpAppBridge(message: string): void {
  void appBridge?.refresh?.({ source: "system", message }).catch(() => undefined);
}

function removeWindowGlobal(key: string): void {
  try {
    delete (globalThis as unknown as Record<string, unknown>)[key];
  } catch {
    (globalThis as unknown as Record<string, unknown>)[key] = undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createCallId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
