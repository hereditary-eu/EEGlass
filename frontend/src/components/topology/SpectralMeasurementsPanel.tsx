import { useEffect, useState } from "react";
import type { ModelBandPowerStatsMode, ModelInfoResponse, SCCResponse, SCCStatsResponse } from "../../types";
import { ModelService } from "../../services/ModelService";
import { useFeatureMode } from "../../vacp/useFeatureMode";
import { TotalBandPowerChart, type TotalBandPowerChartProps } from "./TotalBandPowerChart";

export function SpectralMeasurementsPanel(
  props: TotalBandPowerChartProps & {
    datasetId: string;
    subjectId: string;
    modelInfo: ModelInfoResponse | null;
  },
) {
  const hasSCC = props.modelInfo?.model_kind === "xeegnet_scc";
  const [branch, setBranch] = useFeatureMode("patient-view/measurement-branch", hasSCC, "bp", ["bp", "scc"] as const);
  const [scc, setSCC] = useState<SCCResponse | null>(null);
  const [stats, setStats] = useState<SCCStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [interUnavailable, setInterUnavailable] = useState(false);
  // SCC reference failures must stay visible; BP's existing unavailable-reference
  // fallback must not change the selected SCC reference mode.
  const [sccStatsMode, setSCCStatsMode] = useState<ModelBandPowerStatsMode>("intra_patient");
  const [sccCohort, setSCCCohort] = useState<string | null>(null);
  const name = props.modelInfo?.name;
  useEffect(() => {
    let current = true;
    setSCC(null);
    setError(null);
    setLoading(false);
    if (branch !== "scc" || !name || props.selectedWindowIndex === null) return;
    setLoading(true);
    ModelService.computeSCC(props.datasetId, props.subjectId, props.selectedWindowIndex, name)
      .then((value) => {
        if (current) setSCC(value);
      })
      .catch((e) => {
        if (current) setError(`Unable to load spectral connectivity: ${e.message}`);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [branch, name, props.datasetId, props.subjectId, props.selectedWindowIndex]);
  useEffect(() => {
    let current = true;
    setStats(null);
    setStatsError(null);
    setLoadingStats(false);
    if (branch !== "scc" || !name || props.selectedWindowIndex === null) return;
    setLoadingStats(true);
    ModelService.getSCCStats(props.datasetId, props.subjectId, name, sccStatsMode, sccCohort)
      .then((value) => {
        if (current) {
          setStats(value);
          setInterUnavailable(false);
        }
      })
      .catch((e) => {
        if (current) {
          const unavailable = e.statusCode === 404 && sccStatsMode === "inter_patient" && !sccCohort;
          setInterUnavailable(unavailable);
          setStatsError(
            unavailable
              ? "Run Compute all to enable inter-patient SCC ranges."
              : `Unable to load SCC ranges: ${e.message}`,
          );
        }
      })
      .finally(() => {
        if (current) setLoadingStats(false);
      });
    return () => {
      current = false;
    };
  }, [
    branch,
    name,
    props.datasetId,
    props.subjectId,
    props.selectedWindowIndex === null,
    sccStatsMode,
    sccCohort,
    props.isInterStatsUnavailable,
  ]);
  return (
    <TotalBandPowerChart
      {...props}
      branch={branch}
      hasSCC={hasSCC}
      onBranchChange={setBranch}
      scc={scc}
      sccStats={stats}
      bandPowerStatsMode={branch === "scc" ? sccStatsMode : props.bandPowerStatsMode}
      bandPowerStatsCohortLabel={branch === "scc" ? sccCohort : props.bandPowerStatsCohortLabel}
      onBandPowerStatsModeChange={
        branch === "scc"
          ? (mode) => {
              setSCCStatsMode(mode);
              if (mode === "intra_patient") setSCCCohort(null);
            }
          : props.onBandPowerStatsModeChange
      }
      onBandPowerStatsCohortLabelChange={branch === "scc" ? setSCCCohort : props.onBandPowerStatsCohortLabelChange}
      modelBands={branch === "scc" ? (props.modelInfo?.scc_bands ?? []) : props.modelBands}
      isLoading={branch === "scc" ? loading : props.isLoading}
      isLoadingStats={branch === "scc" ? loadingStats : props.isLoadingStats}
      error={branch === "scc" ? error : props.error}
      statsError={branch === "scc" ? statsError : props.statsError}
      isInterStatsUnavailable={branch === "scc" ? interUnavailable : props.isInterStatsUnavailable}
    />
  );
}
