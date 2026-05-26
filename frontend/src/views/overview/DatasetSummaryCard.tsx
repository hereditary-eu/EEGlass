import { useEffect, useMemo, useRef, useState } from "react";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { ComponentStatusIndicator } from "../../components";
import type { ComponentStatus } from "../../components/ui";
import { formatCompactClassLabel, getDistributionClassColor, getModelClassLabels } from "../../constants/eegModel";
import type {
  ModelInfoResponse,
  ModelPredictionCacheStatus,
  TimeseriesDatasetInfo,
  TimeseriesSubjectInfo,
} from "../../types";
import { resizeVegaView, useVegaLayoutResize } from "../../utils/vegaLayout";
import { registerVacpVegaLiteChart } from "../../vacp/registerVegaLiteChart";

interface DatasetSummaryCardProps {
  dataset: TimeseriesDatasetInfo | null;
  subjects: TimeseriesSubjectInfo[];
  cacheStatus: ModelPredictionCacheStatus | null;
  isLoadingSubjects: boolean;
  error: string | null;
  modelInfo: ModelInfoResponse | null;
}

interface LabelDistributionDatum {
  classLabel: string;
  classShort: string;
  series: "True label" | "Predicted label";
  count: number;
  color: string;
  opacity: number;
}

export function DatasetSummaryCard({
  dataset,
  subjects,
  cacheStatus,
  isLoadingSubjects,
  error,
  modelInfo,
}: DatasetSummaryCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const [plotHeight, setPlotHeight] = useState(180);
  const classLabels = useMemo(() => getModelClassLabels(modelInfo?.classes), [modelInfo]);
  const values = useMemo(
    () => createLabelDistributionValues(subjects, cacheStatus, modelInfo),
    [cacheStatus, modelInfo, subjects],
  );
  const hasPredictedLabels = useMemo(() => values.some((value) => value.series === "Predicted label"), [values]);
  const status = getDatasetSummaryStatus({ subjects, isLoadingSubjects, error });
  useVegaLayoutResize(viewRef);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextHeight = Math.max(150, Math.floor(entry.contentRect.height));
      setPlotHeight((current) => (current === nextHeight ? current : nextHeight));
      resizeVegaView(viewRef.current);
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
      viewRef.current = null;
      return;
    }

    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
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
          sort: classLabels.map((label) => formatCompactClassLabel(label, modelInfo?.classes)),
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
    let unregisterVacp: (() => void) | null = null;
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
          unregisterVacp = registerVacpVegaLiteChart({
            root: container,
            view: result.view,
            spec,
            chartId: "overview/dataset-summary-label-distribution",
            title: "Dataset Summary Label Distribution",
            description: "Label distribution for the current dataset.",
          });
        }
      })
      .catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      unregisterVacp?.();
      unregisterVacp = null;
      viewRef.current = null;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [classLabels, isLoadingSubjects, modelInfo, plotHeight, values]);

  return (
    <section className="overview-placeholder-card overview-dataset-summary-card">
      <div className="overview-card-header">
        <div>
          <p className="overview-kicker">Dataset Summary</p>
          <h3 title={dataset?.name || dataset?.id || "Dataset summary"}>
            {dataset?.name || dataset?.id || "Dataset summary"}
          </h3>
        </div>
        <ComponentStatusIndicator status={status.status} label={status.label} />
      </div>
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

function getDatasetSummaryStatus({
  subjects,
  isLoadingSubjects,
  error,
}: {
  subjects: TimeseriesSubjectInfo[];
  isLoadingSubjects: boolean;
  error: string | null;
}): { status: ComponentStatus; label: string } {
  if (error) {
    return { status: "error", label: error };
  }

  if (isLoadingSubjects) {
    return { status: "loading", label: "Loading subjects" };
  }

  if (subjects.length) {
    return { status: "loaded", label: "Subject data loaded" };
  }

  return { status: "idle", label: "No subject data" };
}

function createLabelDistributionValues(
  subjects: TimeseriesSubjectInfo[],
  cacheStatus: ModelPredictionCacheStatus | null,
  modelInfo: ModelInfoResponse | null,
): LabelDistributionDatum[] {
  const modelClasses = modelInfo?.classes ?? [];
  const modelClassLabels = getModelClassLabels(modelClasses);
  if (!modelClassLabels.length) {
    return [];
  }

  const trueCounts = countLabels(subjects.map((subject) => subject.subject_label));
  const predictedCounts = countLabels(cacheStatus?.subject_summaries.map((summary) => summary.predicted_label) ?? []);
  const hasPredictions = Object.values(predictedCounts).some((count) => count > 0);
  const values: LabelDistributionDatum[] = [];

  modelClassLabels.forEach((classLabel) => {
    values.push({
      classLabel,
      classShort: formatCompactClassLabel(classLabel, modelClasses),
      series: "True label",
      count: trueCounts[classLabel] ?? 0,
      color: getDistributionClassColor(classLabel, modelClasses),
      opacity: 0.46,
    });

    if (hasPredictions) {
      values.push({
        classLabel,
        classShort: formatCompactClassLabel(classLabel, modelClasses),
        series: "Predicted label",
        count: predictedCounts[classLabel] ?? 0,
        color: getDistributionClassColor(classLabel, modelClasses),
        opacity: 0.95,
      });
    }
  });

  return values.filter((value) => value.count > 0 || subjects.length > 0 || hasPredictions);
}

function countLabels(labels: Array<string | null | undefined>) {
  const counts: Record<string, number> = {};

  labels.forEach((label) => {
    if (label) {
      counts[label] = (counts[label] ?? 0) + 1;
    }
  });

  return counts;
}
