import { ClassificationEvidencePanel, TopologyAttributionPanel, TotalBandPowerChart } from "../components";
import { useTimeseriesData } from "../hooks/useTimeseriesData";
import { TimeseriesSlot } from "./TimeseriesSlot";

export function MainPanel() {
  const ts = useTimeseriesData();

  return (
    <section className="tool-panel" aria-label="Main tool workspace">
      <div className="tool-panel-top">
        <article className="tool-slot">
          <TotalBandPowerChart bandPower={ts.bandPower} isLoading={ts.isLoadingBandPower} error={ts.bandPowerError} />
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
