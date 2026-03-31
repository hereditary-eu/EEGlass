import { useState } from "react";

import "../pca-biplot/NeurodegenVis.css";
import type { NeuroPatient } from "../../types/neuro";
import {
  createMockNeuroDataset,
  NEURO_CATEGORICAL_FEATURES,
  NEURO_INITIAL_SCATTER_FEATURES,
  NEURO_PLOTTABLE_FEATURES,
} from "../../utils/neurodegenvis/mockData";
import { NeuroHistogram } from "./Histogram";
import { NeuroScatterplot } from "./Scatterplot";

interface ScatterHistogramProps {
  patientsData: NeuroPatient[];
  plottableFeatures?: string[];
  categoricalFeatures?: string[];
  initialXFeature?: string;
  initialYFeature?: string;
  initialCategoricalFeature?: string;
  k?: number;
}

export function ScatterHistogram({
  patientsData,
  plottableFeatures = NEURO_PLOTTABLE_FEATURES,
  categoricalFeatures = NEURO_CATEGORICAL_FEATURES,
  initialXFeature = NEURO_INITIAL_SCATTER_FEATURES[0],
  initialYFeature = NEURO_INITIAL_SCATTER_FEATURES[1],
  initialCategoricalFeature = "None",
  k = 3,
}: ScatterHistogramProps) {
  const [xFeature, setXFeature] = useState(initialXFeature);
  const [yFeature, setYFeature] = useState(initialYFeature);
  const [categoricalFeature, setCategoricalFeature] = useState(initialCategoricalFeature);

  const isHistogram = xFeature === yFeature;

  return (
    <div className="neurodegenvis-card flex-container-column">
      <div className="pca-heading-container neurodegenvis-toolbar">
        <h4 className="plot-headings">{isHistogram ? yFeature : `${yFeature} vs ${xFeature}`}</h4>
        <div className="neurodegenvis-controls-grid">
          <label className="neurodegenvis-select-group">
            <span>X</span>
            <select className="single-select-dropdown" value={xFeature} onChange={(event) => setXFeature(event.target.value)}>
              {plottableFeatures.map((feature) => (
                <option key={feature} value={feature}>
                  {feature}
                </option>
              ))}
            </select>
          </label>
          <label className="neurodegenvis-select-group">
            <span>Y</span>
            <select className="single-select-dropdown" value={yFeature} onChange={(event) => setYFeature(event.target.value)}>
              {plottableFeatures.map((feature) => (
                <option key={feature} value={feature}>
                  {feature}
                </option>
              ))}
            </select>
          </label>
          <label className="neurodegenvis-select-group">
            <span>Category</span>
            <select
              className="single-select-dropdown"
              value={categoricalFeature}
              onChange={(event) => setCategoricalFeature(event.target.value)}
            >
              {categoricalFeatures.map((feature) => (
                <option key={feature} value={feature}>
                  {feature}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isHistogram ? (
        <NeuroHistogram
          patientsData={patientsData}
          selectedFeature={xFeature}
          categoricalFeature={categoricalFeature}
          kMeanClusters={k}
        />
      ) : (
        <NeuroScatterplot
          xFeature={xFeature}
          yFeature={yFeature}
          patientsData={patientsData}
          categoricalFeature={categoricalFeature}
          kMeanClusters={k}
          showCategoryAverage
        />
      )}
    </div>
  );
}

export function ScatterHistogramMock() {
  const patientsData = createMockNeuroDataset(3).patients;
  return <ScatterHistogram patientsData={patientsData} />;
}
