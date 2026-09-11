import { useEffect, useRef, useState } from "react";
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
  const [stats, setStats] = useState<SCCStatsResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [interUnavailable, setInterUnavailable] = useState(false);
  // SCC reference failures must stay visible; BP's existing unavailable-reference
  // fallback must not change the selected SCC reference mode.
  const [sccStatsMode, setSCCStatsMode] = useState<ModelBandPowerStatsMode>("intra_patient");
  const [sccCohorts, setSCCCohorts] = useState<string[]>([]);
  const statsCacheRef = useRef(new Map<string, SCCStatsResponse>());
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
    setStats([]);
    setStatsError(null);
    setLoadingStats(false);
    if (branch !== "scc" || !name || props.selectedWindowIndex === null) return;
    const cohortLabels = sccStatsMode === "inter_patient" && sccCohorts.length ? sccCohorts : [null];
    const requests = cohortLabels.map((cohortLabel) => {
      const cacheKey = `${name}::${props.datasetId}::${props.subjectId}::${sccStatsMode}::${cohortLabel ?? "all"}`;
      return { cohortLabel, cacheKey, cached: statsCacheRef.current.get(cacheKey) };
    });
    const cachedStats = requests.every((request) => request.cached)
      ? requests.map((request) => request.cached as SCCStatsResponse)
      : null;
    if (cachedStats) {
      setStats(cachedStats);
      setInterUnavailable(false);
      return;
    }

    setLoadingStats(true);
    Promise.all(
      requests.map((request) =>
        request.cached
          ? Promise.resolve(request.cached)
          : ModelService.getSCCStats(
              props.datasetId,
              props.subjectId,
              name,
              sccStatsMode,
              request.cohortLabel,
            ).then((value) => {
              statsCacheRef.current.set(request.cacheKey, value);
              return value;
            }),
      ),
    )
      .then((values) => {
        if (current) {
          setStats(values);
          setInterUnavailable(false);
        }
      })
      .catch((e) => {
        if (current) {
          const unavailable =
            e.statusCode === 404 &&
            sccStatsMode === "inter_patient" &&
            cohortLabels.length === 1 &&
            cohortLabels[0] === null;
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
    sccCohorts,
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
      bandPowerStatsCohortLabels={branch === "scc" ? sccCohorts : props.bandPowerStatsCohortLabels}
      onBandPowerStatsModeChange={
        branch === "scc"
          ? (mode) => {
              setSCCStatsMode(mode);
              if (mode === "intra_patient") setSCCCohorts([]);
            }
          : props.onBandPowerStatsModeChange
      }
      onBandPowerStatsCohortLabelsChange={
        branch === "scc" ? setSCCCohorts : props.onBandPowerStatsCohortLabelsChange
      }
      modelBands={branch === "scc" ? (props.modelInfo?.scc_bands ?? []) : props.modelBands}
      isLoading={branch === "scc" ? loading : props.isLoading}
      isLoadingStats={branch === "scc" ? loadingStats : props.isLoadingStats}
      error={branch === "scc" ? error : props.error}
      statsError={branch === "scc" ? statsError : props.statsError}
      isInterStatsUnavailable={branch === "scc" ? interUnavailable : props.isInterStatsUnavailable}
    />
  );
}
