import "../pca-biplot/NeurodegenVis.css";
import type { FeatureId, FeaturePair } from "../../types";
import { useControllableState } from "../../utils/useControllableState";
import {
  createMockNeuroDataset,
  NEURO_COVARIATE_FEATURES,
  NEURO_INITIAL_COVARIATE_FEATURES,
  NEURO_INITIAL_SCATTER_FEATURES,
} from "../../utils/neurodegenvis/mockData";
import { NeuroHeatmapPlot } from "./Heatmap";
import type { CorrelationHeatmapDatum } from "./Heatmap";

export interface CorrelationHeatmapProps {
  patientsData: CorrelationHeatmapDatum[];
  covariateFeatures?: FeatureId[];
  selectedCovariateFeatures?: FeatureId[];
  selectedFeaturePair?: FeaturePair;
  defaultSelectedCovariateFeatures?: FeatureId[];
  defaultSelectedFeaturePair?: FeaturePair;
  initialSelectedCovariateFeatures?: FeatureId[];
  initialSelectedFeatures?: FeaturePair;
  onSelectedCovariateFeaturesChange?: (features: FeatureId[]) => void;
  onSelectedFeaturePairChange?: (featurePair: FeaturePair) => void;
}

export function CorrelationHeatmap({
  patientsData,
  covariateFeatures = NEURO_COVARIATE_FEATURES,
  selectedCovariateFeatures,
  selectedFeaturePair,
  defaultSelectedCovariateFeatures,
  defaultSelectedFeaturePair,
  initialSelectedCovariateFeatures,
  initialSelectedFeatures,
  onSelectedCovariateFeaturesChange,
  onSelectedFeaturePairChange,
}: CorrelationHeatmapProps) {
  const [resolvedSelectedCovariateFeatures, setSelectedCovariateFeatures] = useControllableState({
    value: selectedCovariateFeatures,
    defaultValue:
      defaultSelectedCovariateFeatures ?? initialSelectedCovariateFeatures ?? NEURO_INITIAL_COVARIATE_FEATURES,
    onChange: onSelectedCovariateFeaturesChange,
  });
  const [resolvedSelectedFeaturePair, setSelectedFeaturePair] = useControllableState({
    value: selectedFeaturePair,
    defaultValue: defaultSelectedFeaturePair ?? initialSelectedFeatures ?? NEURO_INITIAL_SCATTER_FEATURES,
    onChange: onSelectedFeaturePairChange,
  });

  const handleCheckboxChange = (feature: string) => {
    setSelectedCovariateFeatures((current) => {
      if (current.includes(feature)) {
        return current.filter((item) => item !== feature);
      }

      return [...current, feature];
    });
  };

  return (
    <div className="neurodegenvis-card flex-container-column">
      <div className="flex-container-row">
        <h3 className="pearsonCorrelation-heading">Pearson correlation for selected features</h3>
      </div>

      <div className="checkbox-container">
        {covariateFeatures.map((feature) => (
          <label key={feature}>
            <input
              type="checkbox"
              checked={resolvedSelectedCovariateFeatures.includes(feature)}
              onChange={() => handleCheckboxChange(feature)}
            />
            {feature}
          </label>
        ))}
      </div>

      <p className="neurodegenvis-caption">
        Selected pair: <strong>{resolvedSelectedFeaturePair[0]}</strong> vs{" "}
        <strong>{resolvedSelectedFeaturePair[1]}</strong>
      </p>

      <NeuroHeatmapPlot
        patientsData={patientsData}
        covariateFeatures={resolvedSelectedCovariateFeatures}
        selectedFeatures={resolvedSelectedFeaturePair}
        onSelectedFeaturesChange={setSelectedFeaturePair}
      />
    </div>
  );
}

export function CorrelationHeatmapMock() {
  const patientsData = createMockNeuroDataset(3).patients;
  return <CorrelationHeatmap patientsData={patientsData} />;
}
