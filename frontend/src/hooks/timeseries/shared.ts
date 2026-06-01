import type { ChannelId, TimeseriesSource } from "../../types";

export const DEFAULT_DATASET_ID = "ds004504";
export const DEFAULT_SUBJECT_ID = "sub-001";
export const DEFAULT_SOURCE: TimeseriesSource = "derivatives";
export const MODEL_INPUT_SOURCE: TimeseriesSource = "derivatives";
export const DEFAULT_PREVIEW_MAX_POINTS = 5000;
export const PREDICTION_CACHE_RETRY_COUNT = 4;
export const PREDICTION_CACHE_RETRY_DELAY_MS = 650;

const DEFAULT_CHANNELS: ChannelId[] = ["F3", "F4", "P3", "P4", "O1", "O2"];

export function resolveSelectedChannels(selectedChannels: ChannelId[], availableChannels: ChannelId[]): ChannelId[] {
  const validSelectedChannels = selectedChannels.filter((channel) => availableChannels.includes(channel));
  if (validSelectedChannels.length > 0) {
    return validSelectedChannels;
  }

  const preferred = DEFAULT_CHANNELS.filter((channel) => availableChannels.includes(channel));
  return preferred.length > 0 ? preferred : availableChannels.slice(0, 4);
}

export function resolveChannelsForLoad(
  selectedChannels: ChannelId[],
  availableChannels: ChannelId[],
  clearedByUser: boolean,
): ChannelId[] {
  const validSelectedChannels = selectedChannels.filter((channel) => availableChannels.includes(channel));
  if (validSelectedChannels.length > 0) {
    return validSelectedChannels;
  }

  if (clearedByUser) {
    return [];
  }

  return resolveSelectedChannels(selectedChannels, availableChannels);
}

export function areSameChannels(left: ChannelId[], right: ChannelId[]): boolean {
  return left.length === right.length && left.every((channel, index) => channel === right[index]);
}

export function resolveSource(currentSource: TimeseriesSource, sources: TimeseriesSource[]): TimeseriesSource {
  if (sources.includes(currentSource)) {
    return currentSource;
  }

  return sources.includes(DEFAULT_SOURCE) ? DEFAULT_SOURCE : (sources[0] ?? DEFAULT_SOURCE);
}

export function orderSources(sources: Array<TimeseriesSource | null>): TimeseriesSource[] {
  const uniqueSources = new Set(sources.filter((source): source is TimeseriesSource => source !== null));
  return (["derivatives", "raw"] as TimeseriesSource[]).filter((source) => uniqueSources.has(source));
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to load EEG timeseries: ${error.message}`;
  }

  return "Unable to load EEG timeseries.";
}

export function getInferenceErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to compute inference: ${error.message}`;
  }

  return "Unable to compute inference.";
}

export function getPredictionCacheErrorMessage(error: unknown): string {
  const statusCode = getErrorStatusCode(error);

  if (statusCode === 404) {
    return "Predictions not computed yet.";
  }

  if (error instanceof Error) {
    return `Unable to load cached predictions: ${error.message}`;
  }

  return "Unable to load cached predictions.";
}

export function getBandPowerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to compute total band power: ${error.message}`;
  }

  return "Unable to compute total band power.";
}

export function getErrorStatusCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "statusCode" in error
    ? (error as { statusCode?: unknown }).statusCode
    : undefined;
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException || (typeof error === "object" && error !== null && "name" in error)) &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
  });
}
