import { useState } from "react";

import "./NeurodegenVis.css";
import type { FeatureId } from "../../types";
import type { NeuroPatient } from "../../types/neuro";
import { useControllableState } from "../../utils/useControllableState";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import {
  createMockNeuroDataset,
  NEURO_INITIAL_BIPLOT_FEATURES,
  NEURO_PCA_FEATURES,
} from "../../utils/neurodegenvis/mockData";
import { NeuroPcaBiplot } from "./PcaBiplot";

export interface PcaBiplotPanelProps {
  patientsData: NeuroPatient[];
  loadings: number[][];
  numericFeatures?: FeatureId[];
  biplotFeatures?: FeatureId[];
  k?: number;
  defaultBiplotFeatures?: FeatureId[];
  defaultK?: number;
  initialBiplotFeatures?: FeatureId[];
  initialK?: number;
  onBiplotFeaturesChange?: (features: FeatureId[]) => void;
  onKChange?: (k: number) => void;
  onRunClustering?: (k: number) => NeuroPatient[];
}

export function PcaBiplotPanel({
  patientsData: initialPatientsData,
  loadings,
  numericFeatures = NEURO_PCA_FEATURES,
  biplotFeatures,
  k,
  defaultBiplotFeatures,
  defaultK,
  initialBiplotFeatures,
  initialK,
  onBiplotFeaturesChange,
  onKChange,
  onRunClustering,
}: PcaBiplotPanelProps) {
  const [patientsData, setPatientsData] = useState(initialPatientsData);
  const [resolvedBiplotFeatures, setBiplotFeatures] = useControllableState({
    value: biplotFeatures,
    defaultValue: defaultBiplotFeatures ?? initialBiplotFeatures ?? NEURO_INITIAL_BIPLOT_FEATURES,
    onChange: onBiplotFeaturesChange,
  });
  const [resolvedK, setK] = useControllableState({
    value: k,
    defaultValue: defaultK ?? initialK ?? 3,
    onChange: onKChange,
  });

  const rerunClustering = () => {
    if (!onRunClustering) {
      return;
    }

    setPatientsData(onRunClustering(resolvedK));
  };

  return (
    <div className="neurodegenvis-card flex-container-column">
      <div className="pca-heading-container">
        <h4 className="plot-headings">PCA analysis</h4>
        <MultiSelectDropdown
          options={numericFeatures}
          selectedOptions={resolvedBiplotFeatures}
          onSelectedOptionsChange={setBiplotFeatures}
        />
      </div>

      <div className="kmeans-container">
        <label htmlFor="kmeans-input">Number of clusters (k):</label>
        <input
          type="number"
          id="kmeans-input"
          value={resolvedK}
          onChange={(event) => setK(Number(event.target.value))}
          min="1"
          max="9"
        />
        <button type="button" className="neurodegenvis-button" onClick={rerunClustering}>
          Run
        </button>
      </div>

      <NeuroPcaBiplot
        patientsData={patientsData}
        numericFeatures={numericFeatures}
        loadings={loadings}
        biplotFeatures={resolvedBiplotFeatures}
        showKMeans={resolvedK > 1}
      />
    </div>
  );
}

export function PcaBiplotPanelMock() {
  const initialDataset = createMockNeuroDataset(3);

  return (
    <PcaBiplotPanel
      patientsData={initialDataset.patients}
      loadings={initialDataset.loadings}
      onRunClustering={(k) => createMockNeuroDataset(k).patients}
    />
  );
}
