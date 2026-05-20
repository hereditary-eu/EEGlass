import type { ModelClassPresentation, TimeseriesBandFilter } from "../types";

export const MODEL_BANDS = [
  "delta",
  "theta",
  "alpha",
  "beta1",
  "beta2",
  "beta3",
  "gamma",
] as const satisfies readonly TimeseriesBandFilter[];

export const MODEL_BAND_LABELS: Record<TimeseriesBandFilter, string> = {
  delta: "delta",
  theta: "theta",
  alpha: "alpha",
  beta1: "beta1",
  beta2: "beta2",
  beta3: "beta3",
  gamma: "gamma",
};

export interface ModelClassColors {
  annotation: string;
  distribution: string;
  embedding_fill: string;
  embedding_stroke: string;
}

const EMPTY_CLASS_COLORS: ModelClassColors = {
  annotation: "rgb(23 33 43 / 8%)",
  distribution: "rgb(148 163 184 / 22%)",
  embedding_fill: "rgb(148 163 184 / 22%)",
  embedding_stroke: "#64748b",
};

export const MODEL_CLASS_COLORS = {
  Healthy: {
    annotation: "rgb(21 128 61 / 22%)",
    distribution: "rgb(21 128 61 / 32%)",
    embedding_fill: "rgb(21 128 61 / 22%)",
    embedding_stroke: "#15803d",
  },
  Alzheimer: {
    annotation: "rgb(225 29 72 / 28%)",
    distribution: "rgb(225 29 72 / 34%)",
    embedding_fill: "rgb(225 29 72 / 22%)",
    embedding_stroke: "#be123c",
  },
  "Frontotemporal Dementia": {
    annotation: "#c2ddfc",
    distribution: "#c2ddfc",
    embedding_fill: "rgb(37 99 235 / 20%)",
    embedding_stroke: "#2563eb",
  },
} satisfies Record<string, ModelClassColors>;

export function getModelClassLabels(classes: ModelClassPresentation[] | null | undefined): string[] {
  return classes?.map((modelClass) => modelClass.label) ?? [];
}

export function getClassPresentation(
  classes: ModelClassPresentation[] | null | undefined,
  label: string | null | undefined,
): ModelClassPresentation | null {
  if (!label) {
    return null;
  }

  return classes?.find((modelClass) => modelClass.label === label) ?? null;
}

export function formatCompactClassLabel(
  label: string | null | undefined,
  classes: ModelClassPresentation[] | null | undefined,
): string {
  return getClassPresentation(classes, label)?.compact_label ?? label ?? "--";
}

export function getAnnotationClassColor(
  label: string | null | undefined,
  classes: ModelClassPresentation[] | null | undefined,
): string {
  return getClassColors(label, classes).annotation;
}

export function getDistributionClassColor(
  label: string | null | undefined,
  classes: ModelClassPresentation[] | null | undefined,
): string {
  return getClassColors(label, classes).distribution;
}

export function getEmbeddingClassColors(
  label: string | null | undefined,
  classes: ModelClassPresentation[] | null | undefined,
): { fill: string; stroke: string } {
  const colors = getClassColors(label, classes);
  return { fill: colors.embedding_fill, stroke: colors.embedding_stroke };
}

function getClassColors(
  label: string | null | undefined,
  classes: ModelClassPresentation[] | null | undefined,
): ModelClassColors {
  const classLabel = getClassPresentation(classes, label)?.label ?? label;

  if (!classLabel) {
    return EMPTY_CLASS_COLORS;
  }

  return MODEL_CLASS_COLORS[classLabel] ?? EMPTY_CLASS_COLORS;
}
