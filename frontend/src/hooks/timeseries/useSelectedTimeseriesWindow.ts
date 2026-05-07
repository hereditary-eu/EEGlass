import { useMemo } from "react";

import type { ModelInferenceResponse } from "../../types";

interface UseSelectedTimeseriesWindowOptions {
  inferenceResult: ModelInferenceResponse | null;
  hoveredPredictionWindowIndex: number | null;
  lockedPredictionWindowIndex: number | null;
}

export function useSelectedTimeseriesWindow({
  inferenceResult,
  hoveredPredictionWindowIndex,
  lockedPredictionWindowIndex,
}: UseSelectedTimeseriesWindowOptions) {
  const selectedPredictionWindowIndex = hoveredPredictionWindowIndex ?? lockedPredictionWindowIndex;
  const selectedPredictionWindow = useMemo(
    () =>
      selectedPredictionWindowIndex === null
        ? null
        : (inferenceResult?.predictions[selectedPredictionWindowIndex] ?? null),
    [inferenceResult, selectedPredictionWindowIndex],
  );

  return {
    selectedPredictionWindowIndex,
    selectedPredictionWindow,
  };
}
