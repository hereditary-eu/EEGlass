import { useState } from "react";

import "./NeurodegenVis.css";
import type { NeuroPatient } from "../../types/neuro";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import {
  createMockNeuroDataset,
  NEURO_INITIAL_BIPLOT_FEATURES,
  NEURO_PCA_FEATURES,
} from "../../utils/neurodegenvis/mockData";
import { NeuroPcaBiplot } from "./PcaBiplot";

interface PcaBiplotPanelProps {
  patientsData: NeuroPatient[];
  loadings: number[][];
  numericFeatures?: string[];
  initialBiplotFeatures?: string[];
  initialK?: number;
  onRunClustering?: (k: number) => NeuroPatient[];
}

export function PcaBiplotPanel({
  patientsData: initialPatientsData,
  loadings,
  numericFeatures = NEURO_PCA_FEATURES,
  initialBiplotFeatures = NEURO_INITIAL_BIPLOT_FEATURES,
  initialK = 3,
  onRunClustering,
}: PcaBiplotPanelProps) {
  const [patientsData, setPatientsData] = useState(initialPatientsData);
  const [biplotFeatures, setBiplotFeatures] = useState(initialBiplotFeatures);
  const [k, setK] = useState(initialK);

  const rerunClustering = () => {
    if (!onRunClustering) {
      return;
    }

    setPatientsData(onRunClustering(k));
  };

  return (
    <div className="neurodegenvis-card flex-container-column">
      <div className="pca-heading-container">
        <h4 className="plot-headings">PCA analysis</h4>
        <MultiSelectDropdown
          options={numericFeatures}
          selectedOptions={biplotFeatures}
          onSelectedOptionsChange={setBiplotFeatures}
        />
      </div>

      <div className="kmeans-container">
        <label htmlFor="kmeans-input">Number of clusters (k):</label>
        <input
          type="number"
          id="kmeans-input"
          value={k}
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
        biplotFeatures={biplotFeatures}
        showKMeans={k > 1}
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
