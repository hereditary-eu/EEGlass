import { useEffect } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";

import { ClassContributionsPanel, EegScalpTopologyPanel, TotalBandPowerChart } from "../components";
import { MODEL_BANDS } from "../constants/eegModel";
import { useTimeseriesData } from "../hooks/useTimeseriesData";
import type { PatientViewOutletContext } from "../layouts/AppLayout";
import { useAppStore } from "../stores/useAppStore";
import { TimeseriesSlot } from "./TimeseriesSlot";
import { WindowEmbeddingPanel } from "./WindowEmbeddingPanel";

export function PatientView() {
  const { datasetId, subjectId } = useParams();
  const navigate = useNavigate();
  const { setPatientViewHeaderDetails } = useOutletContext<PatientViewOutletContext>();
  const ts = useTimeseriesData({ datasetId, subjectId });
  const setSelectedTimeseriesBandFilter = useAppStore((state) => state.setSelectedTimeseriesBandFilter);

  useEffect(() => {
    if (!datasetId || !subjectId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigate("/", {
          state: {
            datasetId,
            directoryLevel: "patients",
            selectedSubjectId: subjectId,
          },
        });
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const subjects = ts.subjects;
        if (!subjects.length) return;
        const currentIndex = subjects.findIndex((s) => s.id === subjectId);
        if (currentIndex === -1) return;
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = (currentIndex + direction + subjects.length) % subjects.length;
        navigate(`/datasets/${encodeURIComponent(datasetId)}/patients/${encodeURIComponent(subjects[nextIndex].id)}`);
        return;
      }

      if (event.key === "c" || event.key === "d") {
        const channels = ts.availableChannels;
        if (!channels.length) return;
        const current = ts.activeChannels[0] ?? null;
        const currentIndex = current ? channels.indexOf(current) : -1;
        const direction = event.key === "c" ? 1 : -1;
        const nextIndex = (currentIndex + direction + channels.length) % channels.length;
        ts.handleSingleChannelSelect(channels[nextIndex]);
        return;
      }

      if (event.key === "n" || event.key === "m") {
        const current = ts.selectedTimeseriesBandFilter;
        const currentIndex = current ? MODEL_BANDS.indexOf(current) : -1;
        const direction = event.key === "n" ? 1 : -1;
        const nextIndex = (currentIndex + direction + MODEL_BANDS.length) % MODEL_BANDS.length;
        setSelectedTimeseriesBandFilter(MODEL_BANDS[nextIndex]);
        return;
      }

      if (event.key === "j" || event.key === "k") {
        const windows = ts.inferenceResult?.predictions;
        if (!windows?.length) return;
        const current = ts.lockedPredictionWindowIndex ?? -1;
        const direction = event.key === "j" ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(windows.length - 1, current + direction));
        ts.setLockedPredictionWindowIndex(nextIndex);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [datasetId, navigate, setSelectedTimeseriesBandFilter, subjectId, ts]);

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
