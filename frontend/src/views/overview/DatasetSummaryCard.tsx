import { useEffect, useMemo, useRef, useState } from "react";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { CLASS_COLORS, MODEL_CLASS_LABELS, MODEL_COMPACT_CLASS_LABELS } from "../../constants/eegModel";
import type { ModelPredictionCacheStatus, TimeseriesDatasetInfo, TimeseriesSubjectInfo } from "../../types";

interface DatasetSummaryCardProps {
  dataset: TimeseriesDatasetInfo | null;
  subjects: TimeseriesSubjectInfo[];
  cacheStatus: ModelPredictionCacheStatus | null;
  isLoadingSubjects: boolean;
}

interface LabelDistributionDatum {
  classLabel: string;
  classShort: string;
  series: "True label" | "Predicted label";
  count: number;
  color: string;
  opacity: number;
}

export function DatasetSummaryCard({ dataset, subjects, cacheStatus, isLoadingSubjects }: DatasetSummaryCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [plotHeight, setPlotHeight] = useState(180);
  const values = useMemo(
    () => createLabelDistributionValues(subjects, cacheStatus),
    [cacheStatus, subjects],
  );
  const hasPredictedLabels = useMemo(() => values.some((value) => value.series === "Predicted label"), [values]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextHeight = Math.max(150, Math.floor(entry.contentRect.height));
      setPlotHeight((current) => (current === nextHeight ? current : nextHeight));
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!values.length || isLoadingSubjects || plotHeight <= 0) {
      return;
    }

    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      width: "container",
      height: plotHeight,
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { values },
      mark: {
        type: "bar",
        cornerRadiusTopLeft: 2,
        cornerRadiusTopRight: 2,
      },
      encoding: {
        x: {
          field: "classShort",
          type: "nominal",
          sort: MODEL_CLASS_LABELS.map((label) => MODEL_COMPACT_CLASS_LABELS[label]),
          axis: {
            title: null,
            labelColor: "#5d6b78",
            labelFontSize: 11,
            labelFontWeight: 700,
            tickColor: "#d7e0e8",
            domainColor: "#d7e0e8",
          },
        },
        xOffset: {
          field: "series",
          sort: ["True label", "Predicted label"],
        },
        y: {
          field: "count",
          type: "quantitative",
          axis: {
            title: "Patients",
            titleColor: "#5d6b78",
            titleFontSize: 11,
            labelColor: "#5d6b78",
            labelFontSize: 11,
            tickMinStep: 1,
            gridColor: "#e8eef3",
            domain: false,
          },
          scale: { nice: true, zero: true },
        },
        color: { field: "color", type: "nominal", scale: null, legend: null },
        opacity: { field: "opacity", type: "quantitative", scale: null, legend: null },
        tooltip: [
          { field: "classLabel", type: "nominal", title: "Class" },
          { field: "series", type: "nominal", title: "Distribution" },
          { field: "count", type: "quantitative", title: "Patients" },
        ],
      },
      config: {
        view: { stroke: null },
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
  }, [isLoadingSubjects, plotHeight, values]);

  return (
    <section className="overview-placeholder-card overview-dataset-summary-card">
      <p className="overview-kicker">Dataset Summary</p>
      <h3 title={dataset?.name || dataset?.id || "Dataset summary"}>
        {dataset?.name || dataset?.id || "Dataset summary"}
      </h3>
      {dataset ? (
        <dl className="overview-dataset-details">
          <div>
            <dt>Dataset ID</dt>
            <dd>{dataset.id}</dd>
          </div>
          <div>
            <dt>Patients</dt>
            <dd>{dataset.subject_count}</dd>
          </div>
        </dl>
      ) : null}
      <div className="overview-label-distribution">
        <div className="overview-label-distribution-header">
          <h4>Label distribution</h4>
          <span>{hasPredictedLabels ? "True vs predicted" : "True labels"}</span>
        </div>
        <div className="overview-label-distribution-plot" ref={containerRef} />
        {isLoadingSubjects ? <div className="overview-label-distribution-empty">Loading labels...</div> : null}
        {!isLoadingSubjects && !values.length ? (
          <div className="overview-label-distribution-empty">No label data available.</div>
        ) : null}
      </div>
    </section>
  );
}

function createLabelDistributionValues(
  subjects: TimeseriesSubjectInfo[],
  cacheStatus: ModelPredictionCacheStatus | null,
): LabelDistributionDatum[] {
  const trueCounts = countLabels(subjects.map((subject) => subject.subject_label));
  const predictedCounts = countLabels(cacheStatus?.subject_summaries.map((summary) => summary.predicted_label) ?? []);
  const hasPredictions = Object.values(predictedCounts).some((count) => count > 0);
  const values: LabelDistributionDatum[] = [];

  MODEL_CLASS_LABELS.forEach((classLabel) => {
    values.push({
      classLabel,
      classShort: MODEL_COMPACT_CLASS_LABELS[classLabel],
      series: "True label",
      count: trueCounts[classLabel] ?? 0,
      color: CLASS_COLORS.distribution[classLabel],
      opacity: 0.46,
    });

    if (hasPredictions) {
      values.push({
        classLabel,
        classShort: MODEL_COMPACT_CLASS_LABELS[classLabel],
        series: "Predicted label",
        count: predictedCounts[classLabel] ?? 0,
        color: CLASS_COLORS.distribution[classLabel],
        opacity: 0.95,
      });
    }
  });

  return values.filter((value) => value.count > 0 || subjects.length > 0 || hasPredictions);
}

function countLabels(labels: Array<string | null | undefined>) {
  const counts = Object.fromEntries(MODEL_CLASS_LABELS.map((label) => [label, 0])) as Record<
    (typeof MODEL_CLASS_LABELS)[number],
    number
  >;

  labels.forEach((label) => {
    if (label && label in counts) {
      counts[label as keyof typeof counts] += 1;
    }
  });

  return counts;
}
