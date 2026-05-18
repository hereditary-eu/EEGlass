import { useEffect } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";

import { ClassContributionsPanel, EegScalpTopologyPanel, TotalBandPowerChart } from "../components";
import { useTimeseriesData } from "../hooks/useTimeseriesData";
import type { PatientViewOutletContext } from "../layouts/AppLayout";
import { TimeseriesSlot } from "./TimeseriesSlot";
import { WindowEmbeddingPanel } from "./WindowEmbeddingPanel";

export function PatientView() {
  const { datasetId, subjectId } = useParams();
  const navigate = useNavigate();
  const { setPatientViewHeaderDetails } = useOutletContext<PatientViewOutletContext>();
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

  useEffect(() => {
    if (!datasetId || !subjectId) {
      setPatientViewHeaderDetails(null);
      return;
    }

    setPatientViewHeaderDetails({
      datasetId,
      subjectId,
      trueLabel: ts.metadata?.subject_label ?? null,
    });

    return () => setPatientViewHeaderDetails(null);
  }, [datasetId, setPatientViewHeaderDetails, subjectId, ts.metadata?.subject_label]);

  if (!datasetId || !subjectId) {
    return (
      <section className="patient-view-slot-placeholder">
        <span>
          No patient selected. <Link to="/">Return to overview</Link>.
        </span>
      </section>
    );
  }

  return (
    <section className="patient-view-panel" aria-label="Patient view">
      <article className="patient-view-slot patient-view-slot--timeseries">
        <TimeseriesSlot ts={ts} />
      </article>
      <article className="patient-view-slot" aria-label="Window embedding panel">
        <WindowEmbeddingPanel
          datasetId={ts.datasetId}
          subjectId={ts.subjectId}
          source={ts.source}
          modelInfo={ts.modelInfo}
          selectedWindowIndex={ts.lockedPredictionWindowIndex}
          hoveredWindowIndex={ts.hoveredPredictionWindowIndex}
          onSelectedWindowIndexChange={ts.setLockedPredictionWindowIndex}
          onHoveredWindowIndexChange={ts.setHoveredPredictionWindowIndex}
        />
      </article>

      <article className="patient-view-slot">
        <TotalBandPowerChart
          bandPower={ts.bandPower}
          bandPowerStats={ts.bandPowerStats}
          bandPowerStatsMode={ts.bandPowerStatsMode}
          isInterStatsUnavailable={ts.isInterBandPowerStatsUnavailable}
          isLoading={ts.isLoadingBandPower}
          isLoadingStats={ts.isLoadingBandPowerStats}
          error={ts.bandPowerError}
          statsError={ts.bandPowerStatsError}
          selectedChannels={ts.activeChannels}
          onChannelSelect={ts.handleSingleChannelSelect}
          onBandPowerStatsModeChange={ts.setBandPowerStatsMode}
        />
      </article>

      <article className="patient-view-slot">
        <EegScalpTopologyPanel
          datasetId={ts.datasetId}
          subjectId={ts.subjectId}
          source={ts.source}
          modelInfo={ts.modelInfo}
          windowIndex={ts.lockedPredictionWindowIndex}
          selectedChannels={ts.activeChannels}
          onChannelSelect={ts.handleSingleChannelSelect}
        />
      </article>

      <article className="patient-view-slot">
        <ClassContributionsPanel
          datasetId={ts.datasetId}
          subjectId={ts.subjectId}
          source={ts.source}
          windowIndex={ts.lockedPredictionWindowIndex}
        />
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
