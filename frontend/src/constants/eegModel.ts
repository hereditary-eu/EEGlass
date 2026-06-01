import type { ModelBandPresentation, ModelClassPresentation, ModelInfoResponse, TimeseriesBandFilter } from "../types";

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

export const MODEL_CLASS_COLORS: Record<string, ModelClassColors> = {
  Healthy: {
    annotation: "rgb(22 163 74 / 30%)",
    distribution: "rgb(21 128 61 / 32%)",
    embedding_fill: "rgb(22 163 74 / 30%)",
    embedding_stroke: "#16a34a",
  },
  "Alzheimer Disease": {
    annotation: "rgb(225 29 72 / 28%)",
    distribution: "rgb(225 29 72 / 34%)",
    embedding_fill: "rgb(225 29 72 / 22%)",
    embedding_stroke: "#be123c",
  },
  "Frontotemporal Dementia": {
    // Softer reddish violet:
    annotation: "rgb(192 38 211 / 24%)",
    distribution: "rgb(192 38 211 / 34%)",
    embedding_fill: "rgb(192 38 211 / 22%)",
    embedding_stroke: "#a21caf",

    // Plum, closer to Alzheimer Disease but darker:
    // annotation: "rgb(190 24 93 / 24%)",
    // distribution: "rgb(190 24 93 / 34%)",
    // embedding_fill: "rgb(190 24 93 / 22%)",
    // embedding_stroke: "#9d174d",

    // Muted mauve:
    // annotation: "rgb(147 51 234 / 22%)",
    // distribution: "rgb(147 51 234 / 32%)",
    // embedding_fill: "rgb(147 51 234 / 20%)",
    // embedding_stroke: "#6b21a8",

    // annotation: "rgb(168 85 247 / 24%)",
    // distribution: "rgb(168 85 247 / 34%)",
    // embedding_fill: "rgb(168 85 247 / 22%)",
    // embedding_stroke: "#7e22ce",
  },
} satisfies Record<string, ModelClassColors>;

export function getModelClassLabels(classes: ModelClassPresentation[] | null | undefined): string[] {
  return classes?.map((modelClass) => modelClass.label) ?? [];
}

export function getModelBands(modelInfo: ModelInfoResponse | null | undefined): ModelBandPresentation[] {
  return modelInfo?.bands ?? [];
}

export function getModelBandIds(modelInfo: ModelInfoResponse | null | undefined): TimeseriesBandFilter[] {
  return getModelBands(modelInfo).map((modelBand) => modelBand.band);
}

export function getModelBandLabel(
  band: string,
  bands: ModelBandPresentation[] | null | undefined,
): string {
  return bands?.find((modelBand) => modelBand.band === band)?.label ?? band;
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
