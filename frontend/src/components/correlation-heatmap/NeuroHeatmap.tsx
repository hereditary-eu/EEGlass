import { useState } from "react";

import "../pca-biplot/NeurodegenVis.css";
import type { NeuroPatient } from "../../types/neuro";
import {
  createMockNeuroDataset,
  NEURO_COVARIATE_FEATURES,
  NEURO_INITIAL_COVARIATE_FEATURES,
  NEURO_INITIAL_SCATTER_FEATURES,
} from "../../utils/neurodegenvis/mockData";
import { NeuroHeatmapPlot } from "./Heatmap";

interface CorrelationHeatmapProps {
  patientsData: NeuroPatient[];
  covariateFeatures?: string[];
  initialSelectedCovariateFeatures?: string[];
  initialSelectedFeatures?: [string, string];
}

export function CorrelationHeatmap({
  patientsData,
  covariateFeatures = NEURO_COVARIATE_FEATURES,
  initialSelectedCovariateFeatures = NEURO_INITIAL_COVARIATE_FEATURES,
  initialSelectedFeatures = NEURO_INITIAL_SCATTER_FEATURES,
}: CorrelationHeatmapProps) {
  const [selectedCovariateFeatures, setSelectedCovariateFeatures] = useState(initialSelectedCovariateFeatures);
  const [selectedFeatures, setSelectedFeatures] = useState<[string, string]>(initialSelectedFeatures);

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
              checked={selectedCovariateFeatures.includes(feature)}
              onChange={() => handleCheckboxChange(feature)}
            />
            {feature}
          </label>
        ))}
      </div>

      <p className="neurodegenvis-caption">
        Selected pair: <strong>{selectedFeatures[0]}</strong> vs <strong>{selectedFeatures[1]}</strong>
      </p>

      <NeuroHeatmapPlot
        patientsData={patientsData}
        covariateFeatures={selectedCovariateFeatures}
        selectedFeatures={selectedFeatures}
        onSelectedFeaturesChange={setSelectedFeatures}
      />
    </div>
  );
}

export function CorrelationHeatmapMock() {
  const patientsData = createMockNeuroDataset(3).patients;
  return <CorrelationHeatmap patientsData={patientsData} />;
}
