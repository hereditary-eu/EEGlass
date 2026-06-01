import { installVacpOnVegaLiteView } from "@vacp/vega-lite";
import type { VacpActionCall, VacpActionDescriptor, VacpActionResult, VacpEdge, VacpNode, VacpRef } from "@vacp/core";
import type { VisualizationSpec } from "vega-embed";

import { createPrivateVacpGlobalKey, createVacpChartRefPrefix, registerVacpChart, VACP_APP_ID } from "./appBridge";

interface RegisterVacpVegaLiteChartArgs {
  root: HTMLElement;
  view: Parameters<typeof installVacpOnVegaLiteView>[0]["view"];
  spec: VisualizationSpec;
  chartId: string;
  title: string;
  description?: string;
  extraNodes?: VacpNode[];
  extraEdges?: VacpEdge[];
  extraActions?: VacpActionDescriptor[];
  executeExtraAction?: (call: VacpActionCall) => VacpActionResult | Promise<VacpActionResult>;
  getExtraState?: () => Record<VacpRef, unknown>;
  getExtraSummary?: () => Record<VacpRef, string>;
}

export function registerVacpVegaLiteChart(args: RegisterVacpVegaLiteChartArgs): () => void {
  const [viewId, vizId] = splitChartId(args.chartId);
  const globalKey = createPrivateVacpGlobalKey(args.chartId);
  const bridge = installVacpOnVegaLiteView({
    root: args.root,
    view: args.view,
    spec: args.spec,
    options: {
      appId: VACP_APP_ID,
      viewId,
      vizId,
      title: args.title,
      description: args.description,
      globalKey,
    },
  });
  const originalGetCapabilities = bridge.getCapabilities.bind(bridge);
  const originalGetState = bridge.getState.bind(bridge);
  const originalExecute = bridge.execute.bind(bridge);

  bridge.getCapabilities = async (...params: Parameters<typeof bridge.getCapabilities>) => {
    const capabilities = await originalGetCapabilities(...params);
    return {
      ...capabilities,
      graph: {
        ...capabilities.graph,
        nodes: args.extraNodes?.length ? [...capabilities.graph.nodes, ...args.extraNodes] : capabilities.graph.nodes,
        edges: args.extraEdges?.length ? [...capabilities.graph.edges, ...args.extraEdges] : capabilities.graph.edges,
        actions: args.extraActions?.length
          ? [...capabilities.graph.actions, ...args.extraActions]
          : capabilities.graph.actions,
      },
    };
  };

  bridge.getState = async (...params: Parameters<typeof bridge.getState>) => {
    const state = await originalGetState(...params);
    if ("state" in state) {
      Object.assign(state.state, args.getExtraState?.() ?? {});
      const extraSummary = args.getExtraSummary?.() ?? {};
      if (Object.keys(extraSummary).length) state.summary = { ...(state.summary ?? {}), ...extraSummary };
    }
    return state;
  };

  bridge.execute = async (call) => {
    if (args.extraActions?.some((action) => action.name === call.name)) {
      return (
        args.executeExtraAction?.(call) ?? {
          callId: call.callId,
          ok: false,
          error: { message: `No handler registered for ${call.name}.` },
        }
      );
    }

    return originalExecute(call);
  };

  return registerVacpChart({
    id: args.chartId,
    title: args.title,
    refPrefix: createVacpChartRefPrefix(args.chartId),
    globalKey,
    bridge,
  });
}

function splitChartId(chartId: string): [string, string] {
  const clean = chartId.trim().replace(/^\/+|\/+$/g, "");
  const [viewId, ...vizParts] = clean.split("/").filter(Boolean);
  return [viewId || "app", vizParts.join("/") || "chart"];
}
