import { useEffect, useMemo, useState } from "react";

import {
  BandClassMatrix,
  type BandClassMatrixCell,
  formatBandClassValue,
  getBandClassDivergingColor,
} from "../../components/classification";
import { formatCompactClassLabel } from "../../constants/eegModel";
import { ModelService } from "../../services/ModelService";
import type { ModelClassWeightsResponse, ModelInfoResponse } from "../../types";
import { getOverviewError } from "./overviewUtils";

interface ModelClassWeightsMatrixProps {
  modelInfo: ModelInfoResponse;
}

const weightsCache = new Map<string, ModelClassWeightsResponse>();

export function ModelClassWeightsMatrix({ modelInfo }: ModelClassWeightsMatrixProps) {
  const [weights, setWeights] = useState<ModelClassWeightsResponse | null>(
    () => weightsCache.get(modelInfo.name) ?? null,
  );
  const [isLoading, setIsLoading] = useState(!weightsCache.has(modelInfo.name));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const cachedWeights = weightsCache.get(modelInfo.name);
    if (cachedWeights) {
      setWeights(cachedWeights);
      setIsLoading(false);
      setError(null);
      return;
    }

    setWeights(null);
    setIsLoading(true);
    setError(null);

    ModelService.getClassWeights(modelInfo.name)
      .then((response) => {
        weightsCache.set(modelInfo.name, response);
        if (!isCurrent) {
          return;
        }

        setWeights(response);
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setWeights(null);
        setError(getOverviewError(loadError, "Unable to load dense weights."));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [modelInfo.name]);

  const activeWeights = weights?.model_name === modelInfo.name ? weights : null;
  const cells = useMemo(
    () => (activeWeights ? createWeightCells(activeWeights, modelInfo) : []),
    [activeWeights, modelInfo],
  );

  return (
    <div className="overview-model-class-weights">
      <div className="overview-model-section-heading">
        <div>
          <h4>Dense weights</h4>
          <span>{activeWeights?.layer_name ?? "Dense"}: bands to classes</span>
        </div>
        {/* <span>{activeWeights?.unit_label ?? "weight"}</span> */}
      </div>

      <div className="overview-model-class-weights-shell">
        {cells.length ? (
          <BandClassMatrix
            cells={cells}
            className="overview-model-class-weights-plot"
            rowHeight={34}
            minHeight={102}
            tooltip={createWeightTooltip()}
          />
        ) : null}
        {!cells.length ? (
          <div
            className={`overview-model-class-weights-overlay${
              error ? " overview-model-class-weights-overlay--error" : ""
            }`}
          >
            {error ?? (isLoading ? "Loading dense weights..." : "No dense weights available.")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function createWeightCells(weights: ModelClassWeightsResponse, modelInfo: ModelInfoResponse): BandClassMatrixCell[] {
  const maxAbsWeight = Math.max(weights.global_max_abs_weight, 1e-12);
  return modelInfo.classes.flatMap((modelClass, classOrder) =>
    weights.bands.map((band, bandOrder) => {
      const classWeight = band.class_weights.find((item) => item.class_id === modelClass.class_id);
      const weight = classWeight?.weight ?? 0;
      const valueText = formatBandClassValue(weight);

      return {
        classLabel: modelClass.label,
        classShort: formatCompactClassLabel(modelClass.label, modelInfo.classes),
        classOrder,
        band: band.band,
        bandOrder,
        value: weight,
        valueText,
        weight,
        cellColor: getBandClassDivergingColor(weight, maxAbsWeight),
        tooltipValue: `${band.band} -> ${modelClass.label}: ${valueText}`,
      };
    }),
  );
}

function createWeightTooltip() {
  return [
    { field: "classLabel", type: "nominal" as const, title: "Class" },
    { field: "band", type: "nominal" as const, title: "Band" },
    { field: "weight", type: "quantitative" as const, title: "Dense weight", format: "+.4f" },
    { field: "tooltipValue", type: "nominal" as const, title: "Displayed" },
  ];
}

export type { ModelClassWeightsMatrixProps };
