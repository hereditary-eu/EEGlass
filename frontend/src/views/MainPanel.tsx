import { TimeseriesSlot } from "./TimeseriesSlot";

export function MainPanel() {
  return (
    <section className="tool-panel" aria-label="Main tool workspace">
      <div className="tool-panel-top">

        <article className="tool-slot">
          <div className="tool-slot-placeholder"> Panel 2 - Bandfilter - Slot</div>
        </article>

        <article className="tool-slot">
          <div className="tool-slot-placeholder"> Panel 3 - Räumliche Aggregation der Bandfilter über Channels - Slot</div>
        </article>

        <article className="tool-slot">
          <div className="tool-slot-placeholder"> Panel 4 - Klassifizierung - Slot</div>
        </article>
      </div>
      <article className="tool-slot tool-slot--timeseries">
        <TimeseriesSlot />
      </article>
    </section>
  );
}