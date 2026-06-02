import type { FeatureId, FeaturePair } from "../../types";
import { useControllableState } from "../../utils/useControllableState";
import { NeuroHeatmapPlot } from "./Heatmap";
import type { CorrelationHeatmapDatum } from "./Heatmap";
import "./CorrelationHeatmap.css";

const DEFAULT_COVARIATE_FEATURES: FeatureId[] = ["Feature 1", "Feature 2"];
const DEFAULT_SELECTED_FEATURE_PAIR: FeaturePair = ["Feature 1", "Feature 2"];

export interface CorrelationHeatmapProps {
  patientsData: CorrelationHeatmapDatum[];
  covariateFeatures?: FeatureId[];
  selectedFeaturePair?: FeaturePair;
  defaultSelectedFeaturePair?: FeaturePair;
  initialSelectedFeatures?: FeaturePair;
  onSelectedFeaturePairChange?: (featurePair: FeaturePair) => void;
}

export function CorrelationHeatmap({
  patientsData,
  covariateFeatures = DEFAULT_COVARIATE_FEATURES,
  selectedFeaturePair,
  defaultSelectedFeaturePair,
  initialSelectedFeatures,
  onSelectedFeaturePairChange,
}: CorrelationHeatmapProps) {
  const [resolvedSelectedFeaturePair, setSelectedFeaturePair] = useControllableState({
    value: selectedFeaturePair,
    defaultValue: defaultSelectedFeaturePair ?? initialSelectedFeatures ?? DEFAULT_SELECTED_FEATURE_PAIR,
    onChange: onSelectedFeaturePairChange,
  });

  return (
    <div className="correlation-heatmap-card">
      <div className="flex-container-row">
        <h3 className="pearsonCorrelation-heading">Pearson correlation for embedding features</h3>
      </div>

      <p className="correlation-heatmap-caption">
        Selected pair: <strong>{resolvedSelectedFeaturePair[0]}</strong> vs{" "}
        <strong>{resolvedSelectedFeaturePair[1]}</strong>
      </p>

      <NeuroHeatmapPlot
        patientsData={patientsData}
        covariateFeatures={covariateFeatures}
        selectedFeatures={resolvedSelectedFeaturePair}
        onSelectedFeaturesChange={setSelectedFeaturePair}
      />
    </div>
  );
}
