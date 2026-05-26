import { installVacpDebugUi } from "@vacp/debug-ui";

import { ensureVacpAppBridge } from "./appBridge";

export function installAppVacpDebugOverlay(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    ensureVacpAppBridge();
    installVacpDebugUi({ enabled: true, globalKey: "__vacp", includeActions: true });
  } catch (err) {
    console.warn(`Failed to install VACP debug UI: ${String(err)}`);
  }
}
