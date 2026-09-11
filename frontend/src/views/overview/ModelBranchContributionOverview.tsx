import { useEffect, useMemo, useRef } from "react";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import type {
  ModelBranchContributionStats,
  ModelPredictionCacheStatus,
  ModelPredictionSummary,
} from "../../types";
import { resizeVegaView, useVegaLayoutResize } from "../../utils/vegaLayout";
import { registerVacpVegaLiteChart } from "../../vacp/registerVegaLiteChart";

interface ModelBranchContributionOverviewProps {
  cacheStatus: ModelPredictionCacheStatus | null;
  isCacheRunning: boolean;
}

interface CohortBranchDatum {
  branch: "BP" | "SCC";
  branchOrder: number;
  branchLabel: string;
  meanShare: number;
  lowerShare95: number;
  upperShare95: number;
  lowerQuartile: number;
  medianShare: number;
  upperQuartile: number;
  meanCancellation: number | null;
  lowerCancellation95: number | null;
  upperCancellation95: number | null;
  patientCount: number;
  windowCount: number;
  color: string;
}

interface CohortContributionData {
  branches: CohortBranchDatum[];
  patientCount: number;
  cancellationLabel: string;
}

const BP_COLOR = "#0e7490";
const SCC_COLOR = "#9333a8";

export function ModelBranchContributionOverview({
  cacheStatus,
  isCacheRunning,
}: ModelBranchContributionOverviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const chartData = useMemo(() => createChartData(cacheStatus?.subject_summaries ?? []), [cacheStatus]);
  useVegaLayoutResize(viewRef);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    if (!chartData) {
      viewRef.current = null;
      return;
    }

    const tooltip = createContributionTooltip();
    const branchEncoding = {
      field: "branchLabel",
      type: "nominal" as const,
      sort: { field: "branchOrder", order: "ascending" as const },
      axis: {
        title: null,
        domain: false,
        ticks: false,
        labelColor: "#475569",
        labelFontSize: 9,
        labelFontWeight: 800,
        labelPadding: 6,
      },
    };
    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      background: "transparent",
      width: "container",
      height: 52,
      layer: [
        {
          data: { values: chartData.branches },
          mark: { type: "rule", strokeWidth: 2 },
          encoding: {
            x: {
              field: "lowerShare95",
              type: "quantitative",
              scale: { domain: [0, 100] },
              axis: {
                title: null,
                values: [0, 25, 50, 75, 100],
                labelExpr: "datum.label + '%'",
                labelColor: "#748391",
                labelFontSize: 9,
                labelPadding: 3,
                gridColor: "#e8eef3",
                domain: false,
                ticks: false,
              },
            },
            x2: { field: "upperShare95" },
            y: branchEncoding,
            color: { field: "color", type: "nominal", scale: null, legend: null },
            tooltip,
          },
        },
        {
          data: { values: chartData.branches },
          mark: { type: "bar", size: 14, cornerRadius: 3, opacity: 0.28, strokeWidth: 1.5 },
          encoding: {
            x: { field: "lowerQuartile", type: "quantitative" },
            x2: { field: "upperQuartile" },
            y: branchEncoding,
            color: { field: "color", type: "nominal", scale: null, legend: null },
            stroke: { field: "color", type: "nominal", scale: null, legend: null },
            tooltip,
          },
        },
        {
          data: { values: chartData.branches },
          mark: { type: "tick", orient: "vertical", size: 14, thickness: 2, color: "#334155" },
          encoding: {
            x: { field: "medianShare", type: "quantitative" },
            y: branchEncoding,
            tooltip,
          },
        },
        {
          data: { values: chartData.branches },
          mark: {
            type: "point",
            shape: "diamond",
            size: 62,
            filled: true,
            stroke: "#ffffff",
            strokeWidth: 1,
          },
          encoding: {
            x: { field: "meanShare", type: "quantitative" },
            y: branchEncoding,
            color: { field: "color", type: "nominal", scale: null, legend: null },
            tooltip,
          },
        },
      ],
      config: { view: { stroke: null } },
    };

    let finalized = false;
    let unregisterVacp: (() => void) | null = null;
    const resultPromise = embed(container, spec, { actions: false, renderer: "svg" });
    resultPromise.catch(() => undefined);
    resultPromise
      .then((result) => {
        if (finalized) return;
        viewRef.current = result.view;
        resizeVegaView(result.view);
        unregisterVacp = registerVacpVegaLiteChart({
          root: container,
          view: result.view,
          spec,
          chartId: "overview/model-branch-contributions",
          title: "Model Branch Contributions",
          description: "Cohort-level BP and SCC contribution shares and cancellation fractions.",
        });
      })
      .catch(() => undefined);

    return () => {
      finalized = true;
      unregisterVacp?.();
      viewRef.current = null;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [chartData]);

  const emptyMessage = isCacheRunning
    ? "The cohort contribution summary will appear as patients complete."
    : cacheStatus?.status === "complete"
      ? "No branch contribution summary is available. Recompute the prediction cache."
      : "Run Compute all to compare BP and SCC contributions across the cohort.";

  return (
    <section className="overview-model-branch-contributions">
      <div className="overview-model-section-heading">
        <h4>Branch contribution</h4>
        <span>{chartData ? `Patient distribution · ${chartData.patientCount} patients` : "Cohort summary"}</span>
      </div>
      <div className="overview-model-branch-contributions-shell">
        <div className="overview-model-branch-contributions-plot" ref={containerRef} />
        {!chartData && <div className="overview-model-branch-contributions-empty">{emptyMessage}</div>}
      </div>
      {chartData && (
        <div className="overview-model-branch-contributions-caption">
          <span>◆ mean · │ median · box IQR · whiskers 95%</span>
          <span title="Fraction of gross absolute band contribution lost when positive and negative terms are summed.">
            {chartData.cancellationLabel}
          </span>
        </div>
      )}
    </section>
  );
}

function createChartData(summaries: ModelPredictionSummary[]): CohortContributionData | null {
  const patients = summaries
    .map((summary) => {
      const contribution = summary.branch_contributions;
      const bp = contribution?.branches.find((branch) => branch.branch === "bp");
      const scc = contribution?.branches.find((branch) => branch.branch === "scc");
      return contribution && bp && scc ? { contribution, bp, scc } : null;
    })
    .filter((patient): patient is NonNullable<typeof patient> => patient !== null);

  if (!patients.length) return null;

  const patientCount = patients.length;
  const windowCount = patients.reduce((total, patient) => total + patient.contribution.analyzed_window_count, 0);
  const bpShares = patients.map((patient) => patient.bp.share.mean * 100);
  const sccShares = patients.map((patient) => patient.scc.share.mean * 100);
  const bp = cohortBranchDatum("BP", 0, bpShares, patients, windowCount, BP_COLOR);
  const scc = cohortBranchDatum("SCC", 1, sccShares, patients, windowCount, SCC_COLOR);

  return {
    branches: [bp, scc],
    patientCount,
    cancellationLabel:
      `Cancellation fraction: BP ${formatOptionalPercent(bp.meanCancellation)}` +
      ` · SCC ${formatOptionalPercent(scc.meanCancellation)}`,
  };
}

function cohortBranchDatum(
  branch: "BP" | "SCC",
  branchOrder: number,
  shares: number[],
  patients: Array<{
    contribution: NonNullable<ModelPredictionSummary["branch_contributions"]>;
    bp: ModelBranchContributionStats;
    scc: ModelBranchContributionStats;
  }>,
  windowCount: number,
  color: string,
): CohortBranchDatum {
  const branchKey = branch.toLowerCase() as "bp" | "scc";
  const cancellations = patients.flatMap((patient) => {
    const cancellation = patient[branchKey].cancellation;
    return cancellation ? [cancellation.mean * 100] : [];
  });
  const meanShare = mean(shares) ?? 0;

  return {
    branch,
    branchOrder,
    branchLabel: `${branch} ${formatPercent(meanShare)}`,
    meanShare,
    lowerShare95: quantile(shares, 0.025),
    upperShare95: quantile(shares, 0.975),
    lowerQuartile: quantile(shares, 0.25),
    medianShare: quantile(shares, 0.5),
    upperQuartile: quantile(shares, 0.75),
    meanCancellation: mean(cancellations),
    lowerCancellation95: cancellations.length ? quantile(cancellations, 0.025) : null,
    upperCancellation95: cancellations.length ? quantile(cancellations, 0.975) : null,
    patientCount: patients.length,
    windowCount,
    color,
  };
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function quantile(values: number[], probability: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const fraction = position - lowerIndex;
  const upperIndex = Math.min(lowerIndex + 1, sorted.length - 1);
  return sorted[lowerIndex] + fraction * (sorted[upperIndex] - sorted[lowerIndex]);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatOptionalPercent(value: number | null): string {
  return value == null ? "n/a" : formatPercent(value);
}

function createContributionTooltip() {
  return [
    { field: "branch", type: "nominal" as const, title: "Branch" },
    { field: "meanShare", type: "quantitative" as const, title: "Cohort mean share (%)", format: ".1f" },
    { field: "medianShare", type: "quantitative" as const, title: "Median share (%)", format: ".1f" },
    { field: "lowerQuartile", type: "quantitative" as const, title: "Share Q1 (%)", format: ".1f" },
    { field: "upperQuartile", type: "quantitative" as const, title: "Share Q3 (%)", format: ".1f" },
    { field: "lowerShare95", type: "quantitative" as const, title: "Patient 2.5%", format: ".1f" },
    { field: "upperShare95", type: "quantitative" as const, title: "Patient 97.5%", format: ".1f" },
    {
      field: "meanCancellation",
      type: "quantitative" as const,
      title: "Mean cancellation fraction (%)",
      format: ".1f",
    },
    {
      field: "lowerCancellation95",
      type: "quantitative" as const,
      title: "Cancellation fraction 2.5%",
      format: ".1f",
    },
    {
      field: "upperCancellation95",
      type: "quantitative" as const,
      title: "Cancellation fraction 97.5%",
      format: ".1f",
    },
    { field: "patientCount", type: "quantitative" as const, title: "Patients" },
    { field: "windowCount", type: "quantitative" as const, title: "Analyzed windows" },
  ];
}

export type { ModelBranchContributionOverviewProps };
