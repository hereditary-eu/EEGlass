import { useEffect, useMemo, useRef, useState } from "react";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { formatCompactClassLabel } from "../../constants/eegModel";
import { TimeseriesService } from "../../services/TimeseriesService";
import type { ModelClassEvidenceResponse, ModelInfoResponse, TimeseriesSource } from "../../types";
import { ComponentStatusIndicator, MathFormula } from "../ui";
import "./ClassContributionsPanel.css";

export interface ClassContributionsPanelProps {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  modelInfo: ModelInfoResponse | null;
  windowIndex: number | null;
}

type EvidenceDisplayMode = "relative" | "raw";
interface ClassContributionDatum {
  classLabel: string;
  classShort: string;
  classOrder: number;
  band: string;
  contributionGroup: string;
  bandOrder: number;
  contributionRaw: number;
  contributionRelative: number;
  contributionDisplayed: number;
  contributionText: string;
  colorScale: number;
  normalizedContribution: number;
  cellColor: string;
  isTotal: boolean;
  isPredictedClass: boolean;
  isWinningLogit: boolean;
  tooltipValue: string;
}

interface ClassLogitDatum {
  classLabel: string;
  classShort: string;
  classOrder: number;
  logitColumn: string;
  logit: number;
  logitText: string;
  normalizedLogit: number;
  cellColor: string;
  isPredictedClass: boolean;
  isWinningLogit: boolean;
  tooltipValue: string;
}

export function ClassContributionsPanel({
  datasetId,
  subjectId,
  source,
  modelInfo,
  windowIndex,
}: ClassContributionsPanelProps) {
  const cacheRef = useRef(new Map<string, ModelClassEvidenceResponse>());
  const [evidence, setEvidence] = useState<ModelClassEvidenceResponse | null>(null);
  const [displayMode, setDisplayMode] = useState<EvidenceDisplayMode>("raw");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const modelName = modelInfo?.name;
    if (!datasetId || !subjectId || !modelName || windowIndex === null) {
      setEvidence(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const cacheKey = `${modelName}::${datasetId}::${subjectId}::${source}::${windowIndex}`;
    const cachedEvidence = cacheRef.current.get(cacheKey);
    if (cachedEvidence) {
      setEvidence(cachedEvidence);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setError(null);

    TimeseriesService.computeClassEvidence(datasetId, subjectId, windowIndex, source, modelName)
      .then((response) => {
        cacheRef.current.set(cacheKey, response);
        if (!isCurrent) {
          return;
        }

        setEvidence(response);
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setEvidence(null);
        setError(getEvidenceErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [datasetId, modelInfo?.name, source, subjectId, windowIndex]);

  const classLabels = useMemo(() => {
    if (!evidence?.bands.length) {
      return [];
    }

    const labels = evidence.bands[0]?.class_contributions.map((contribution) => contribution.class_label) ?? [];
    return labels;
  }, [evidence]);

  const maxAbsContribution = Math.max(evidence?.global_max_abs_contribution ?? 0, 1e-12);
  const contributionRows = useMemo(
    () => (evidence ? createClassContributionRows(evidence, classLabels, displayMode, maxAbsContribution) : []),
    [classLabels, displayMode, evidence, maxAbsContribution],
  );
  const logitRows = useMemo(
    () => (evidence ? createClassLogitRows(evidence, classLabels) : []),
    [classLabels, evidence],
  );
  const decision = useMemo(() => (evidence ? getDecisionSummary(evidence) : null), [evidence]);
  const status = getEvidenceStatus({ error, evidence, isLoading });

  return (
    <div className="classification-evidence">
      <div className="classification-evidence-header">
        <div>
          <h3 className="classification-evidence-title">Class contributions</h3>
          <p className="classification-evidence-subtitle">
            {evidence
              ? `Window ${evidence.window_index + 1}: ${evidence.start_time.toFixed(1)}s-${evidence.end_time.toFixed(1)}s`
              : windowIndex === null
                ? "Select a prediction window"
                : `Window ${windowIndex + 1}`}
          </p>
        </div>
        <div className="classification-evidence-header-side">
          <p className="classification-evidence-stage">
            Dense layer: <MathFormula tex={"Z_f"} /> mapped to class logits <MathFormula tex={"\\Omega"} />
            <ComponentStatusIndicator status={status.status} label={status.label} />
          </p>
          <div className="classification-evidence-mode-toggle" aria-label="Evidence value mode">
            <button
              type="button"
              className={`classification-evidence-mode-button${displayMode === "raw" ? " classification-evidence-mode-button--active" : ""}`}
              onClick={() => setDisplayMode("raw")}
            >
              raw
            </button>
            <button
              type="button"
              className={`classification-evidence-mode-button${displayMode === "relative" ? " classification-evidence-mode-button--active" : ""}`}
              onClick={() => setDisplayMode("relative")}
            >
              rel
            </button>
          </div>
        </div>
      </div>

      <div className="classification-evidence-body">
        {evidence ? (
          <>
            <div className="classification-evidence-chart-grid">
              <ClassContributionsHeatmap rows={contributionRows} />
              <ClassLogitPanel rows={logitRows} />
            </div>

            <div className="classification-evidence-footer">
              <span className="classification-evidence-mode-note">
                {displayMode === "relative"
                  ? "Relative band salience; logit \u03a9 remains raw"
                  : "Raw band contributions"}
              </span>
              {decision ? (
                <div className="classification-evidence-decision">
                  <span className="classification-evidence-decision-kicker">
                    Decision = argmax(
                    <MathFormula tex={"\\Omega"} />)
                  </span>
                  <strong>{decision.label}</strong>
                  <span>{Math.round(decision.confidence * 100)}%</span>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {!evidence && !isLoading && !error ? (
          <div className="classification-evidence-empty">
            Click a 4s prediction window to inspect class contributions.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClassContributionsHeatmap({ rows }: { rows: ClassContributionDatum[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!rows.length) {
      return;
    }

    const xDomain = Array.from(new Set(rows.map((row) => row.band)));
    const yDomain = Array.from(new Set(rows.map((row) => row.classShort)));
    const chartHeight = getEvidenceChartHeight(yDomain.length);
    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: "container",
      height: chartHeight,
      padding: { left: 0, right: 0, top: 31, bottom: 0 },
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { values: rows },
      layer: [
        {
          mark: { type: "rect" },
          encoding: {
            x: createBandXEncoding(xDomain),
            y: createClassYEncoding(yDomain),
            color: { field: "cellColor", type: "nominal", scale: null, legend: null },
            stroke: {
              condition: { test: "datum.isWinningLogit", value: "#0f5f76" },
              value: "#d7e0e8",
            },
            strokeWidth: {
              condition: { test: "datum.isWinningLogit", value: 3 },
              value: 1,
            },
            tooltip: createContributionTooltip(),
          },
        },
        {
          mark: {
            type: "text",
            fontSize: 10,
            fontWeight: 800,
            color: "#17212b",
          },
          encoding: {
            x: createBandXEncoding(xDomain),
            y: createClassYEncoding(yDomain),
            text: { field: "contributionText", type: "nominal" },
            tooltip: createContributionTooltip(),
          },
        },
      ],
      config: {
        axis: {
          domain: false,
          grid: false,
          ticks: false,
          labelColor: "#334155",
          labelFont: "Inter, Segoe UI, sans-serif",
          labelFontSize: 10,
          labelFontWeight: 800,
          title: null,
        },
        view: { stroke: "#d7e0e8" },
      },
    };

    let finalized = false;
    const resultPromise = embed(container, spec, {
      actions: false,
      renderer: "svg",
    });

    resultPromise.catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [rows]);

  return <div className="classification-evidence-heatmap" ref={containerRef} />;
}

function ClassLogitPanel({ rows }: { rows: ClassLogitDatum[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!rows.length) {
      return;
    }

    const yDomain = Array.from(new Set(rows.map((row) => row.classShort)));
    const chartHeight = getEvidenceChartHeight(yDomain.length);
    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: "container",
      height: chartHeight,
      padding: { left: 0, right: 0, top: 31, bottom: 0 },
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { values: rows },
      layer: [
        {
          mark: { type: "rect" },
          encoding: {
            x: createLogitXEncoding(),
            y: createClassYEncoding(yDomain, false),
            color: { field: "cellColor", type: "nominal", scale: null, legend: null },
            stroke: {
              condition: { test: "datum.isWinningLogit", value: "#0f5f76" },
              value: "#d7e0e8",
            },
            strokeWidth: {
              condition: { test: "datum.isWinningLogit", value: 3 },
              value: 1,
            },
            tooltip: createLogitTooltip(),
          },
        },
        {
          mark: {
            type: "text",
            fontSize: 10,
            fontWeight: 800,
            color: "#17212b",
          },
          encoding: {
            x: createLogitXEncoding(),
            y: createClassYEncoding(yDomain, false),
            text: { field: "logitText", type: "nominal" },
            tooltip: createLogitTooltip(),
          },
        },
      ],
      config: {
        axis: {
          domain: false,
          grid: false,
          ticks: false,
          labelColor: "#334155",
          labelFont: "Inter, Segoe UI, sans-serif",
          labelFontSize: 10,
          labelFontWeight: 800,
          title: null,
        },
        view: { stroke: "#d7e0e8" },
      },
    };

    let finalized = false;
    const resultPromise = embed(container, spec, {
      actions: false,
      renderer: "svg",
    });

    resultPromise.catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [rows]);

  return <div className="classification-evidence-logits-chart" ref={containerRef} />;
}

function createClassContributionRows(
  evidence: ModelClassEvidenceResponse,
  classLabels: string[],
  displayMode: EvidenceDisplayMode,
  maxAbsContribution: number,
): ClassContributionDatum[] {
  const totals = new Map<string, number>();
  const rows: ClassContributionDatum[] = [];
  const relativeColorScale = getGlobalMaxAbsRelativeContribution(evidence.bands);

  classLabels.forEach((classLabel, classOrder) => {
    const classShort = formatClassLabel(classLabel);
    evidence.bands.forEach((band, bandOrder) => {
      const contribution = band.class_contributions.find((item) => item.class_label === classLabel);
      const rawContribution = contribution?.contribution ?? 0;
      totals.set(classLabel, (totals.get(classLabel) ?? 0) + rawContribution);
      const displayedContribution =
        displayMode === "relative" ? getRelativeBandContribution(rawContribution, band) : rawContribution;
      const colorScale = displayMode === "relative" ? relativeColorScale : maxAbsContribution;
      rows.push(
        createContributionDatum({
          classLabel,
          classShort,
          classOrder,
          band: band.band,
          bandOrder,
          contributionRaw: rawContribution,
          contributionRelative: getRelativeBandContribution(rawContribution, band),
          contributionDisplayed: displayedContribution,
          colorScale,
          isTotal: false,
          isPredictedClass: classLabel === evidence.predicted_label,
          isWinningLogit: false,
        }),
      );
    });
  });

  return rows;
}

function getEvidenceChartHeight(rowCount: number): number {
  return Math.max(120, rowCount * 76);
}

function createClassLogitRows(evidence: ModelClassEvidenceResponse, classLabels: string[]): ClassLogitDatum[] {
  const logits = classLabels.map((classLabel) => ({
    classLabel,
    logit: evidence.logits[classLabel] ?? 0,
  }));
  const maxAbsLogit = Math.max(...logits.map((item) => Math.abs(item.logit)), 1e-12);
  const winningClassLabel = logits.reduce<string | null>((winner, item) => {
    if (winner === null) {
      return item.classLabel;
    }

    return item.logit > (evidence.logits[winner] ?? Number.NEGATIVE_INFINITY) ? item.classLabel : winner;
  }, null);

  return logits.map(({ classLabel, logit }, classOrder) => ({
    classLabel,
    classShort: formatClassLabel(classLabel),
    classOrder,
    logitColumn: "\u03a9",
    logit,
    logitText: formatContribution(logit),
    normalizedLogit: normalizeContribution(logit, maxAbsLogit),
    cellColor: getEvidenceColor(logit, maxAbsLogit),
    isPredictedClass: classLabel === evidence.predicted_label,
    isWinningLogit: classLabel === winningClassLabel,
    tooltipValue: `${classLabel} logit \u03a9: ${formatContribution(logit)}`,
  }));
}

function createContributionDatum({
  classLabel,
  classShort,
  classOrder,
  band,
  bandOrder,
  contributionRaw,
  contributionRelative,
  contributionDisplayed,
  colorScale,
  isTotal,
  isPredictedClass,
  isWinningLogit,
}: Omit<
  ClassContributionDatum,
  "contributionText" | "normalizedContribution" | "cellColor" | "tooltipValue"
>): ClassContributionDatum {
  return {
    classLabel,
    classShort,
    classOrder,
    band,
    contributionGroup: isTotal ? "Total across bands" : `Band ${band}`,
    bandOrder,
    contributionRaw,
    contributionRelative,
    contributionDisplayed,
    contributionText: formatContribution(contributionDisplayed),
    colorScale,
    normalizedContribution: normalizeContribution(contributionDisplayed, colorScale),
    cellColor: getEvidenceColor(contributionDisplayed, colorScale),
    isTotal,
    isPredictedClass,
    isWinningLogit,
    tooltipValue: isTotal
      ? `${classLabel} total logit contribution: ${formatContribution(contributionDisplayed)}`
      : `${band} -> ${classLabel}: ${formatContribution(contributionDisplayed)}`,
  };
}

function getDecisionSummary(evidence: ModelClassEvidenceResponse): { label: string; confidence: number } {
  const winningLogit = Object.entries(evidence.logits).reduce<[string, number] | null>((winner, [label, logit]) => {
    if (winner === null || logit > winner[1]) {
      return [label, logit];
    }

    return winner;
  }, null);
  const label = winningLogit?.[0] ?? evidence.predicted_label;

  return {
    label,
    confidence: evidence.probabilities[label] ?? evidence.confidence,
  };
}

function createBandXEncoding(domain: string[]) {
  return {
    field: "band",
    type: "nominal" as const,
    sort: domain,
    axis: { orient: "top" as const, labelAngle: 0 },
    scale: { domain, paddingInner: 0, paddingOuter: 0 },
  };
}

function createLogitXEncoding() {
  return {
    field: "logitColumn",
    type: "nominal" as const,
    sort: ["\u03a9"],
    axis: { orient: "top" as const, labelAngle: 0 },
    scale: { domain: ["\u03a9"], paddingInner: 0, paddingOuter: 0 },
  };
}

function createClassYEncoding(domain: string[], showAxis = true) {
  return {
    field: "classShort",
    type: "nominal" as const,
    sort: domain,
    axis: showAxis ? { labelLimit: 78 } : null,
    scale: { domain, paddingInner: 0, paddingOuter: 0 },
  };
}

function createContributionTooltip() {
  return [
    { field: "classLabel", type: "nominal" as const, title: "Class" },
    { field: "contributionGroup", type: "nominal" as const, title: "Contribution" },
    { field: "contributionRaw", type: "quantitative" as const, title: "Raw contribution", format: "+.4f" },
    { field: "contributionRelative", type: "quantitative" as const, title: "Relative contribution", format: "+.4f" },
    { field: "tooltipValue", type: "nominal" as const, title: "Displayed" },
  ];
}

function createLogitTooltip() {
  return [
    { field: "classLabel", type: "nominal" as const, title: "Class" },
    { field: "logit", type: "quantitative" as const, title: "Logit \u03a9", format: "+.4f" },
    { field: "tooltipValue", type: "nominal" as const, title: "Decision value" },
  ];
}

function getRelativeBandContribution(
  contributionValue: number,
  band: ModelClassEvidenceResponse["bands"][number],
): number {
  return contributionValue - getMeanBandContribution(band);
}

function getMeanBandContribution(band: ModelClassEvidenceResponse["bands"][number]): number {
  if (!band.class_contributions.length) {
    return 0;
  }
  const sum = band.class_contributions.reduce((acc, contribution) => acc + contribution.contribution, 0);
  return sum / band.class_contributions.length;
}

function getMaxAbsRelativeBandContribution(band: ModelClassEvidenceResponse["bands"][number]): number {
  const meanAbsContribution = getMeanAbsBandContribution(band);
  return Math.max(
    ...band.class_contributions.map((contribution) =>
      Math.abs(Math.abs(contribution.contribution) - meanAbsContribution),
    ),
    1e-12,
  );
}

function getGlobalMaxAbsRelativeContribution(bands: ModelClassEvidenceResponse["bands"]): number {
  let max = 1e-12;
  for (const band of bands) {
    const meanAbs = getMeanAbsBandContribution(band);
    for (const contribution of band.class_contributions) {
      const relative = Math.abs(Math.abs(contribution.contribution) - meanAbs);
      if (relative > max) max = relative;
    }
  }
  return max;
}

function getMeanAbsBandContribution(band: ModelClassEvidenceResponse["bands"][number]): number {
  if (!band.class_contributions.length) {
    return 0;
  }

  const absContributionSum = band.class_contributions.reduce(
    (sum, contribution) => sum + Math.abs(contribution.contribution),
    0,
  );
  return absContributionSum / band.class_contributions.length;
}

function getEvidenceColor(value: number, maxAbsContribution: number): string {
  const normalized = normalizeContribution(value, maxAbsContribution);
  if (normalized < 0) {
    const strength = Math.abs(normalized);
    const red = Math.round(235 + (14 - 235) * strength);
    const green = Math.round(245 + (116 - 245) * strength);
    const blue = Math.round(248 + (144 - 248) * strength);
    return `rgb(${red} ${green} ${blue})`;
  }

  const red = Math.round(241 + (225 - 241) * normalized);
  const green = Math.round(245 + (29 - 245) * normalized);
  const blue = Math.round(249 + (72 - 249) * normalized);
  return `rgb(${red} ${green} ${blue})`;
}

function normalizeContribution(value: number, maxAbsContribution: number): number {
  return Math.max(-1, Math.min(1, value / maxAbsContribution));
}

function formatContribution(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatClassLabel(classLabel: string): string {
  return formatCompactClassLabel(classLabel, null);
}

function getEvidenceErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to load class contributions: ${error.message}`;
  }

  return "Unable to load class contributions.";
}

function getEvidenceStatus({
  error,
  evidence,
  isLoading,
}: {
  error: string | null;
  evidence: ModelClassEvidenceResponse | null;
  isLoading: boolean;
}): { status: "idle" | "loading" | "loaded" | "error"; label: string } {
  if (error) {
    return { status: "error", label: error };
  }

  if (isLoading) {
    return { status: "loading", label: "Loading class contributions" };
  }

  if (evidence) {
    return { status: "loaded", label: "Class contributions loaded" };
  }

  return { status: "idle", label: "Class contributions idle" };
}

export type { ClassContributionsPanelProps };
