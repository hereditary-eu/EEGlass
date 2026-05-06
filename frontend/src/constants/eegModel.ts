import type { TimeseriesBandFilter } from "../types";

export const DEFAULT_MODEL_NAME = "xeegnet-v1";

export const MODEL_CLASS_LABELS = ["Healthy", "Alzheimer", "Frontotemporal Dementia"] as const;
export type ModelClassLabel = (typeof MODEL_CLASS_LABELS)[number];

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
} as const;

export function isModelClassLabel(label: string | null | undefined): label is ModelClassLabel {
  return MODEL_CLASS_LABELS.includes(label as ModelClassLabel);
}

export function formatCompactClassLabel(label: string | null | undefined): string {
  if (label === "Healthy") {
    return "H";
  }
  if (label === "Alzheimer") {
    return "Alz";
  }
  if (label === "Frontotemporal Dementia") {
    return "FTD";
  }

  return label || "--";
}

export function getAnnotationClassColor(label: string | null | undefined): string {
  return isModelClassLabel(label) ? CLASS_COLORS.annotation[label] : CLASS_COLORS.annotation.empty;
}

export function getPatientClassName(label: string | null | undefined): string {
  return isModelClassLabel(label) ? CLASS_COLORS.patientCell[label] : CLASS_COLORS.patientCell.empty;
}
