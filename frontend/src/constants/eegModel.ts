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

const EMPTY_CLASS_COLORS = {
  annotation: "rgb(23 33 43 / 8%)",
  distribution: "rgb(148 163 184 / 22%)",
  embedding_fill: "rgb(148 163 184 / 22%)",
  embedding_stroke: "#64748b",
};

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
  return getClassPresentation(classes, label)?.colors.annotation ?? EMPTY_CLASS_COLORS.annotation;
}

export function getDistributionClassColor(
  label: string | null | undefined,
  classes: ModelClassPresentation[] | null | undefined,
): string {
  return getClassPresentation(classes, label)?.colors.distribution ?? EMPTY_CLASS_COLORS.distribution;
}

export function getEmbeddingClassColors(
  label: string | null | undefined,
  classes: ModelClassPresentation[] | null | undefined,
): { fill: string; stroke: string } {
  const colors = getClassPresentation(classes, label)?.colors ?? EMPTY_CLASS_COLORS;
  return { fill: colors.embedding_fill, stroke: colors.embedding_stroke };
}
