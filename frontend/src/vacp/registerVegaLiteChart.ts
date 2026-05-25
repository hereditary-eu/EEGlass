import { installVacpOnVegaLiteView } from "@vacp/vega-lite";
import type { VisualizationSpec } from "vega-embed";

import { createPrivateVacpGlobalKey, createVacpChartRefPrefix, registerVacpChart, VACP_APP_ID } from "./appBridge";

interface RegisterVacpVegaLiteChartArgs {
  root: HTMLElement;
  view: Parameters<typeof installVacpOnVegaLiteView>[0]["view"];
  spec: VisualizationSpec;
  chartId: string;
  title: string;
  description?: string;
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
