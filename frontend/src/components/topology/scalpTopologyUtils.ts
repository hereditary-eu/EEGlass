import type { ChannelId, ModelScalpTopologyResponse, TimeseriesBandFilter } from "../../types";

export interface ScalpTopologyValueChannel {
  name: ChannelId;
  x: number;
  y: number;
  value: number;
}

export interface ScalpTopologyValueRange {
  min: number;
  max: number;
}

const DEFAULT_DIVERGING_RANGE: ScalpTopologyValueRange = { min: -1, max: 1 };

export function findScalpBand(
  topologies: ModelScalpTopologyResponse | null,
  selectedBand: TimeseriesBandFilter | null,
) {
  if (!topologies?.bands.length) {
    return null;
  }

  return topologies.bands.find((band) => band.band === selectedBand) ?? topologies.bands[0];
}

export function getRangeFromResponse(topologies: ModelScalpTopologyResponse | null): ScalpTopologyValueRange {
  if (!topologies) {
    return DEFAULT_DIVERGING_RANGE;
  }

  const min = Number.isFinite(topologies.global_min_weight) ? topologies.global_min_weight : 0;
  const max = Number.isFinite(topologies.global_max_weight) ? topologies.global_max_weight : 0;
  return max > min ? { min, max } : DEFAULT_DIVERGING_RANGE;
}

export function formatScalpValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "...";
  }

  const absValue = Math.abs(value);
  if (absValue >= 10) {
    return value.toFixed(1);
  }
  if (absValue >= 1) {
    return value.toFixed(2);
  }

  return value.toFixed(3);
}

export function getScalpTopologyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to load scalp topologies: ${error.message}`;
  }

  return "Unable to load scalp topologies.";
}
