import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ClassificationEvidencePanel, TopologyAttributionPanel, TotalBandPowerChart } from "../components";
import { useTimeseriesData } from "../hooks/useTimeseriesData";
import { TimeseriesSlot } from "./TimeseriesSlot";

export function MainPanel() {
  const { datasetId, subjectId } = useParams();
  const navigate = useNavigate();
  const ts = useTimeseriesData({ datasetId, subjectId });

  useEffect(() => {
    if (!datasetId || !subjectId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" || isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      navigate("/", {
        state: {
          datasetId,
          directoryLevel: "patients",
          selectedSubjectId: subjectId,
        },
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [datasetId, navigate, subjectId]);

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
            modelClasses={ts.modelInfo?.classes ?? []}
          />
        </article>
      </div>

      <article className="tool-slot tool-slot--timeseries">
        <TimeseriesSlot ts={ts} />
      </article>
    </section>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}
