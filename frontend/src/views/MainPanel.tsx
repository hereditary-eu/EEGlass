import { Link, useParams } from "react-router-dom";

import { ClassificationEvidencePanel, TopologyAttributionPanel, TotalBandPowerChart } from "../components";
import { useTimeseriesData } from "../hooks/useTimeseriesData";
import { TimeseriesSlot } from "./TimeseriesSlot";

export function MainPanel() {
  const { datasetId, subjectId } = useParams();
  const ts = useTimeseriesData({ datasetId, subjectId });

  if (!datasetId || !subjectId) {
    return (
      <section className="tool-slot-placeholder">
        <span>
          No patient selected. <Link to="/">Return to overview</Link>.
        </span>
      </section>
    );
  }

  return (
    <section className="tool-panel" aria-label="Main tool workspace">
      <div className="tool-panel-top">
        <article className="tool-slot">
          <TotalBandPowerChart
            bandPower={ts.bandPower}
            isLoading={ts.isLoadingBandPower}
            error={ts.bandPowerError}
            selectedChannels={ts.activeChannels}
            onChannelSelect={ts.handleSingleChannelSelect}
          />
        </article>

        <article className="tool-slot">
          <TopologyAttributionPanel />
        </article>

        <article className="tool-slot">
          <ClassificationEvidencePanel
            datasetId={ts.datasetId}
            subjectId={ts.subjectId}
            source={ts.source}
            windowIndex={ts.lockedPredictionWindowIndex}
          />
        </article>
      </div>

      <article className="tool-slot tool-slot--timeseries">
        <TimeseriesSlot ts={ts} />
      </article>
    </section>
  );
}
