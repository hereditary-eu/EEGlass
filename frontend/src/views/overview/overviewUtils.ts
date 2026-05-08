import type { CSSProperties } from "react";

import { formatCompactClassLabel, getAnnotationClassColor, getDistributionClassColor } from "../../constants/eegModel";
import type {
  ModelClassPresentation,
  ModelPredictionCacheProgress,
  ModelPredictionCacheStatus,
  ModelPredictionSummary,
} from "../../types";

export type DirectoryLevel = "datasets" | "patients";

export function isCacheJobRunning(progress: ModelPredictionCacheProgress | null): boolean {
  return progress?.status === "queued" || progress?.status === "running";
}

export function getCacheSummary(
  status: ModelPredictionCacheStatus | null,
  progress: ModelPredictionCacheProgress | null,
): string {
  if (progress && isCacheJobRunning(progress)) {
    return `${progress.done}/${progress.total || "?"} predicted - ${progress.failed} failed`;
  }

  if (progress?.status === "completed") {
    return `${progress.done}/${progress.total} predicted - ${progress.failed} failed`;
  }

  if (!status) {
    return "Prediction status unavailable";
  }

  if (status.status === "complete") {
    return `${status.completed_subjects}/${status.total_subjects} predictions ready`;
  }

  if (status.status === "partial") {
    return `${status.completed_subjects}/${status.total_subjects} predictions ready - ${status.failed_subjects} failed`;
  }

  return `No predictions cached - ${status.total_subjects} patients`;
}

export function formatMeanConfidence(summary: ModelPredictionSummary | null): string {
  return summary?.mean_confidence === null || summary?.mean_confidence === undefined
    ? "--"
    : `${Math.round(summary.mean_confidence * 100)}%`;
}

export function isPredictionMismatch(summary: ModelPredictionSummary | null): boolean {
  return Boolean(summary?.true_label && summary.predicted_label && summary.true_label !== summary.predicted_label);
}

export function getClassWindowCount(summary: ModelPredictionSummary | null, classLabel: string): string {
  if (!summary) {
    return "--";
  }

  return String(summary.windows_per_class.find((entry) => entry.class_label === classLabel)?.count ?? 0);
}

export function getClassDistributionStyle(
  summary: ModelPredictionSummary,
  modelClasses: ModelClassPresentation[],
): CSSProperties {
  if (!modelClasses.length) {
    return {};
  }

  const counts = modelClasses.map((modelClass) => ({
    color: getDistributionClassColor(modelClass.label, modelClasses),
    count: getClassWindowCountNumber(summary, modelClass.label),
  }));
  const total = Math.max(
    1,
    counts.reduce((sum, item) => sum + item.count, 0),
  );
  let previousStop = 0;
  const stops = counts.flatMap((item) => {
    const nextStop = previousStop + (item.count / total) * 100;
    const segment = [`${item.color} ${previousStop}%`, `${item.color} ${nextStop}%`];
    previousStop = nextStop;
    return segment;
  });

  return { background: `linear-gradient(90deg, ${stops.join(", ")})` };
}

export function getPatientLabelClass(): string {
  return "overview-patient-label";
}

export function getPatientLabelStyle(
  label: string | null | undefined,
  modelClasses: ModelClassPresentation[],
): CSSProperties {
  return { background: getAnnotationClassColor(label, modelClasses) };
}

export function getCompactPatientLabel(
  label: string | null | undefined,
  modelClasses: ModelClassPresentation[],
): string {
  return formatCompactClassLabel(label, modelClasses);
}

export function getDirectoryStatus(
  directoryLevel: DirectoryLevel,
  datasetCount: number,
  subjectCount: number,
  isLoadingDatasets: boolean,
  isLoadingSubjects: boolean,
): string {
  if (directoryLevel === "patients") {
    return isLoadingSubjects ? "Loading patients" : `${subjectCount} patients`;
  }

  return isLoadingDatasets ? "Loading datasets" : `${datasetCount} datasets`;
}

export function getOverviewError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}

function getClassWindowCountNumber(summary: ModelPredictionSummary, classLabel: string): number {
  return summary.windows_per_class.find((entry) => entry.class_label === classLabel)?.count ?? 0;
}
