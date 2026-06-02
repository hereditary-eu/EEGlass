import { useEffect, useMemo, useRef, useState } from "react";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { formatCompactClassLabel } from "../../constants/eegModel";
import { EEG_MODEL_NOTATION, EEG_MODEL_NOTATION_LABELS } from "../../constants/eegModelNotation";
import type { ModelClassEvidenceResponse, ModelInfoResponse, TimeseriesSource } from "../../types";
import { resizeVegaView, useVegaLayoutResize } from "../../utils/vegaLayout";
import { ComponentStatusIndicator, MathFormula } from "../ui";
import {
  BandClassMatrix,
  type BandClassMatrixCell,
  formatBandClassValue,
  getBandClassDivergingColor,
  normalizeBandClassValue,
} from "./BandClassMatrix";
import { useModelClassEvidence } from "./useModelClassEvidence";
import "./ClassContributionsPanel.css";

export interface ClassContributionsPanelProps {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  modelInfo: ModelInfoResponse | null;
  windowIndex: number | null;
  compact?: boolean;
}

type EvidenceDisplayMode = "relative" | "raw";
interface ClassContributionDatum extends BandClassMatrixCell {
  classLabel: string;
  classShort: string;
  classOrder: number;
  band: string;
  contributionGroup: string;
  bandOrder: number;
  value: number;
  valueText: string;
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

type ClassContributionDatumArgs = Pick<
  ClassContributionDatum,
  | "classLabel"
  | "classShort"
  | "classOrder"
  | "band"
  | "bandOrder"
  | "contributionRaw"
  | "contributionRelative"
  | "contributionDisplayed"
  | "colorScale"
  | "isTotal"
  | "isPredictedClass"
  | "isWinningLogit"
>;

export function ClassContributionsPanel({
  datasetId,
  subjectId,
  source,
  modelInfo,
  windowIndex,
  compact = false,
}: ClassContributionsPanelProps) {
  const [displayMode, setDisplayMode] = useState<EvidenceDisplayMode>("raw");
  const { evidence, isLoading, error } = useModelClassEvidence({
    datasetId,
    subjectId,
    modelInfo,
    windowIndex,
  });

  const classLabels = useMemo(() => {
    if (!evidence?.bands.length) {
      return [];
    }

    const labels = evidence.bands[0]?.class_contributions.map((contribution) => contribution.class_label) ?? [];
    return labels;
  }, [evidence]);

  const maxAbsContribution = Math.max(evidence?.global_max_abs_contribution ?? 0, 1e-12);
  const modelClasses = modelInfo?.classes ?? null;
  const contributionRows = useMemo(
    () =>
      evidence ? createClassContributionRows(evidence, classLabels, modelClasses, displayMode, maxAbsContribution) : [],
    [classLabels, displayMode, evidence, maxAbsContribution, modelClasses],
  );
  const logitRows = useMemo(
    () => (evidence ? createClassLogitRows(evidence, classLabels, modelClasses) : []),
    [classLabels, evidence, modelClasses],
  );
  const decision = useMemo(() => (evidence ? getDecisionSummary(evidence) : null), [evidence]);
  const status = getEvidenceStatus({ error, evidence, isLoading });

  return (
    <div className={`classification-evidence${compact ? " classification-evidence--compact" : ""}`}>
      <div className="classification-evidence-header">
        <div>
          <h3 className="classification-evidence-title">Class contributions</h3>
        </div>
        <div className="classification-evidence-header-side">
          <p className="classification-evidence-stage">
            {EEG_MODEL_NOTATION_LABELS.denseLayerPrefix} <MathFormula tex={EEG_MODEL_NOTATION.encoderOutput} />{" "}
            {EEG_MODEL_NOTATION_LABELS.denseLayerConnector} <MathFormula tex={EEG_MODEL_NOTATION.classLogits} />
            <ComponentStatusIndicator status={status.status} label={status.label} />
          </p>
        </div>
      </div>

      <div className="classification-evidence-body">
        {evidence ? (
          <>
            <div className="classification-evidence-chart-grid">
              <BandClassMatrix
                cells={contributionRows}
                className="classification-evidence-heatmap"
                rowHeight={compact ? 34 : 76}
                minHeight={compact ? 102 : 120}
                topPadding={compact ? 18 : 31}
                tooltip={createContributionTooltip()}
              />
              <ClassLogitPanel rows={logitRows} compact={compact} />
            </div>

            <div className="classification-evidence-footer">
              <div className="classification-evidence-footer-left">
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
                <span className="classification-evidence-mode-note">
                  {displayMode === "relative"
                    ? "Relative band salience; logit \u03a9 remains raw"
                    : "Raw band contributions"}
                </span>
              </div>
              {decision ? (
                <div className="classification-evidence-decision">
                  <span className="classification-evidence-decision-kicker">
                    {EEG_MODEL_NOTATION_LABELS.decisionArgmaxPrefix}
                    <MathFormula tex={EEG_MODEL_NOTATION.classLogits} />)
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

function ClassLogitPanel({ rows, compact = false }: { rows: ClassLogitDatum[]; compact?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  useVegaLayoutResize(viewRef);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!rows.length) {
      viewRef.current = null;
      return;
    }

    const yDomain = Array.from(new Set(rows.map((row) => row.classShort)));
    const chartHeight = getEvidenceChartHeight(yDomain.length, compact);
    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: "container",
      height: chartHeight,
      padding: { left: 0, right: 0, top: compact ? 18 : 31, bottom: 0 },
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
    resultPromise
      .then((result) => {
        if (!finalized) {
          viewRef.current = result.view;
          resizeVegaView(result.view);
        }
      })
      .catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      viewRef.current = null;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [compact, rows]);

  return <div className="classification-evidence-logits-chart" ref={containerRef} />;
}

function createClassContributionRows(
  evidence: ModelClassEvidenceResponse,
  classLabels: string[],
  modelClasses: ModelInfoResponse["classes"] | null,
  displayMode: EvidenceDisplayMode,
  maxAbsContribution: number,
): ClassContributionDatum[] {
  const totals = new Map<string, number>();
  const rows: ClassContributionDatum[] = [];
  const relativeColorScale = getGlobalMaxAbsRelativeContribution(evidence.bands);

  classLabels.forEach((classLabel, classOrder) => {
    const classShort = formatClassLabel(classLabel, modelClasses);
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

function getEvidenceChartHeight(rowCount: number, compact = false): number {
  return Math.max(compact ? 102 : 120, rowCount * (compact ? 34 : 76));
}

function createClassLogitRows(
  evidence: ModelClassEvidenceResponse,
  classLabels: string[],
  modelClasses: ModelInfoResponse["classes"] | null,
): ClassLogitDatum[] {
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
    classShort: formatClassLabel(classLabel, modelClasses),
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
}: ClassContributionDatumArgs): ClassContributionDatum {
  const contributionText = formatContribution(contributionDisplayed);

  return {
    classLabel,
    classShort,
    classOrder,
    band,
    contributionGroup: isTotal ? "Total across bands" : `Band ${band}`,
    bandOrder,
    value: contributionDisplayed,
    valueText: contributionText,
    contributionRaw,
    contributionRelative,
    contributionDisplayed,
    contributionText,
    colorScale,
    normalizedContribution: normalizeContribution(contributionDisplayed, colorScale),
    cellColor: getEvidenceColor(contributionDisplayed, colorScale),
    isTotal,
    isPredictedClass,
    isWinningLogit,
    isHighlighted: isWinningLogit,
    tooltipValue: isTotal
      ? `${classLabel} total logit contribution: ${contributionText}`
      : `${band} -> ${classLabel}: ${contributionText}`,
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
  return getBandClassDivergingColor(value, maxAbsContribution);
}

function normalizeContribution(value: number, maxAbsContribution: number): number {
  return normalizeBandClassValue(value, maxAbsContribution);
}

function formatContribution(value: number): string {
  return formatBandClassValue(value);
}

function formatClassLabel(classLabel: string, modelClasses: ModelInfoResponse["classes"] | null): string {
  return formatCompactClassLabel(classLabel, modelClasses);
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

