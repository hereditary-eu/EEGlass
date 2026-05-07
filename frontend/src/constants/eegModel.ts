import type { TimeseriesBandFilter } from "../types";

export const DEFAULT_MODEL_NAME = "xeegnet-v1";
export const MODEL_DISPLAY_NAME = "xEEGNet v1";

export const MODEL_CLASS_LABELS = ["Healthy", "Alzheimer", "Frontotemporal Dementia"] as const;
export type ModelClassLabel = (typeof MODEL_CLASS_LABELS)[number];
export const MODEL_COMPACT_CLASS_LABELS: Record<ModelClassLabel, string> = {
  Healthy: "H",
  Alzheimer: "Alz",
  "Frontotemporal Dementia": "FTD",
};

export const MODEL_BANDS = ["delta", "theta", "alpha", "beta1", "beta2", "beta3", "gamma"] as const satisfies readonly TimeseriesBandFilter[];

export const MODEL_BAND_LABELS: Record<TimeseriesBandFilter, string> = {
  delta: "delta",
  theta: "theta",
  alpha: "alpha",
  beta1: "beta1",
  beta2: "beta2",
  beta3: "beta3",
  gamma: "gamma",
};

export const CLASS_COLORS = {
  annotation: {
    Healthy: "rgb(21 128 61 / 22%)",
    Alzheimer: "rgb(225 29 72 / 28%)",
    "Frontotemporal Dementia": "#c2ddfc",
    empty: "rgb(23 33 43 / 8%)",
  },
  patientCell: {
    Healthy: "overview-patient-label--healthy",
    Alzheimer: "overview-patient-label--alzheimer",
    "Frontotemporal Dementia": "overview-patient-label--ftd",
    empty: "overview-patient-label--empty",
  },
  distribution: {
    Healthy: "rgb(21 128 61 / 32%)",
    Alzheimer: "rgb(225 29 72 / 34%)",
    "Frontotemporal Dementia": "#c2ddfc",
  },
  embedding: {
    Healthy: {
      fill: "rgb(21 128 61 / 22%)",
      stroke: "#15803d",
    },
    Alzheimer: {
      fill: "rgb(225 29 72 / 22%)",
      stroke: "#be123c",
    },
    "Frontotemporal Dementia": {
      fill: "rgb(37 99 235 / 20%)",
      stroke: "#2563eb",
    },
    empty: {
      fill: "rgb(148 163 184 / 22%)",
      stroke: "#64748b",
    },
  },
} as const;

export function isModelClassLabel(label: string | null | undefined): label is ModelClassLabel {
  return MODEL_CLASS_LABELS.includes(label as ModelClassLabel);
}

export function formatCompactClassLabel(label: string | null | undefined): string {
  return isModelClassLabel(label) ? MODEL_COMPACT_CLASS_LABELS[label] : (label || "--");
}

export function getAnnotationClassColor(label: string | null | undefined): string {
  return isModelClassLabel(label) ? CLASS_COLORS.annotation[label] : CLASS_COLORS.annotation.empty;
}

export function getPatientClassName(label: string | null | undefined): string {
  return isModelClassLabel(label) ? CLASS_COLORS.patientCell[label] : CLASS_COLORS.patientCell.empty;
}

export function getEmbeddingClassColors(label: string | null | undefined): { fill: string; stroke: string } {
  return isModelClassLabel(label) ? CLASS_COLORS.embedding[label] : CLASS_COLORS.embedding.empty;
}
