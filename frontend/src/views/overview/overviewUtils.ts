import type { CSSProperties } from "react";

import { CLASS_COLORS, MODEL_CLASS_LABELS, formatCompactClassLabel, getPatientClassName } from "../../constants/eegModel";
import type { ModelPredictionCacheProgress, ModelPredictionCacheStatus, ModelPredictionSummary } from "../../types";

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

export function getClassDistributionStyle(summary: ModelPredictionSummary): CSSProperties {
  const healthy = getClassWindowCountNumber(summary, MODEL_CLASS_LABELS[0]);
  const alzheimer = getClassWindowCountNumber(summary, MODEL_CLASS_LABELS[1]);
  const ftd = getClassWindowCountNumber(summary, MODEL_CLASS_LABELS[2]);
  const total = Math.max(1, healthy + alzheimer + ftd);
  const healthyStop = (healthy / total) * 100;
  const alzheimerStop = healthyStop + (alzheimer / total) * 100;

  return {
    background: `linear-gradient(90deg,
      ${CLASS_COLORS.distribution.Healthy} 0%,
      ${CLASS_COLORS.distribution.Healthy} ${healthyStop}%,
      ${CLASS_COLORS.distribution.Alzheimer} ${healthyStop}%,
      ${CLASS_COLORS.distribution.Alzheimer} ${alzheimerStop}%,
      ${CLASS_COLORS.distribution["Frontotemporal Dementia"]} ${alzheimerStop}%,
      ${CLASS_COLORS.distribution["Frontotemporal Dementia"]} 100%)`,
  };
}

export function getPatientLabelClass(label: string | null | undefined): string {
  return `overview-patient-label ${getPatientClassName(label)}`;
}

export function getCompactPatientLabel(label: string | null | undefined): string {
  return formatCompactClassLabel(label);
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
