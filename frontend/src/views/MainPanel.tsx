import type { ReactNode } from "react";

import { TimeseriesSlot } from "./TimeseriesSlot";

const mainPanelSlots = ["top-panel-1", "top-panel-2", "top-panel-3"] as const;

export function MainPanel() {
  return (
    <section className="tool-panel" aria-label="Main tool workspace">
      <div className="tool-panel-top">
        {mainPanelSlots.map((slot) => (
          <ToolSlot key={slot} />
        ))}
      </div>

      <ToolSlot variant="timeseries">
        <TimeseriesSlot />
      </ToolSlot>
    </section>
  );
}

interface ToolSlotProps {
  variant?: "timeseries";
  children?: ReactNode;
}

function ToolSlot({ variant, children }: ToolSlotProps) {
  return (
    <article className={variant === "timeseries" ? "tool-slot tool-slot--timeseries" : "tool-slot"}>
      {children ?? <div className="tool-slot-placeholder">Component slot</div>}
    </article>
  );
}
