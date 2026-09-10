import { useEffect, useState } from "react";
import { nowIso, VACP_SCHEMA_VERSION, type VacpRef, type VacpActionDescriptor } from "@vacp/core";
import { installVacpRuntimeBridge, VacpActionRegistry } from "@vacp/gateway";
import {
  createPrivateVacpGlobalKey,
  createVacpChartRefPrefix,
  registerVacpChart,
  VACP_APP_ID,
  VACP_APP_REF,
} from "./appBridge";

/** Expose branch controls to the agent using the same state as the visible buttons. */
export function useFeatureMode<T extends string>(id: string, enabled: boolean, initial: T, options: readonly T[]) {
  const [value, setValue] = useState<T>(initial);
  const optionsKey = options.join(",");
  useEffect(() => {
    if (!enabled) return;
    const ref = createVacpChartRefPrefix(id) as VacpRef;
    const globalKey = createPrivateVacpGlobalKey(id);
    const descriptor: VacpActionDescriptor = {
      name: `${id.replaceAll("/", ".").replaceAll("-", "_")}.set_mode`,
      targetRef: ref,
      title: "Set feature view",
      description: `Set ${id} to ${options.join(" or ")}.`,
      parameters: { type: "object", properties: { mode: { type: "string", enum: [...options] } }, required: ["mode"] },
    };
    const actions = new VacpActionRegistry();
    actions.register(descriptor, (params) => {
      const mode = (params as { mode?: T })?.mode;
      if (!mode || !options.includes(mode)) throw new Error("Unsupported feature view");
      setValue(mode);
      return { mode };
    });
    const bridge = installVacpRuntimeBridge({
      globalKey,
      sessionKey: `${VACP_APP_ID}:${id}`,
      actions,
      snapshots: {
        getCapabilities: () => ({
          version: VACP_SCHEMA_VERSION,
          createdAt: nowIso(),
          graph: {
            version: VACP_SCHEMA_VERSION,
            nodes: [{ ref, kind: "Selection", layer: "InteractionFeedbackLayer", title: id }],
            edges: [{ from: VACP_APP_REF, to: ref, kind: "contains" }],
            actions: [descriptor],
          },
        }),
        getState: () => ({
          version: VACP_SCHEMA_VERSION,
          createdAt: nowIso(),
          state: { [ref]: { mode: value, availableModes: [...options] } },
          summary: { [ref]: `${id}: ${value}` },
        }),
      },
    });
    return registerVacpChart({ id, title: id, refPrefix: ref, globalKey, bridge });
  }, [id, enabled, value, optionsKey]);
  return [value, setValue] as const;
}
