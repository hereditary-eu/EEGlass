import "../pca-biplot/NeurodegenVis.css";
import type { FeatureId } from "../../types";
import type { NeuroPatient } from "../../types/neuro";
import { useControllableState } from "../../utils/useControllableState";
import {
  createMockNeuroDataset,
  NEURO_CATEGORICAL_FEATURES,
  NEURO_INITIAL_SCATTER_FEATURES,
  NEURO_PLOTTABLE_FEATURES,
} from "../../utils/neurodegenvis/mockData";
import { NeuroHistogram } from "./Histogram";
import { NeuroScatterplot } from "./Scatterplot";

export interface ScatterHistogramProps {
  patientsData: NeuroPatient[];
  plottableFeatures?: FeatureId[];
  categoricalFeatures?: FeatureId[];
  selectedXFeature?: FeatureId;
  selectedYFeature?: FeatureId;
  selectedCategoricalFeature?: FeatureId;
  k?: number;
  defaultSelectedXFeature?: FeatureId;
  defaultSelectedYFeature?: FeatureId;
  defaultSelectedCategoricalFeature?: FeatureId;
  defaultK?: number;
  initialXFeature?: FeatureId;
  initialYFeature?: FeatureId;
  initialCategoricalFeature?: FeatureId;
  onSelectedXFeatureChange?: (feature: FeatureId) => void;
  onSelectedYFeatureChange?: (feature: FeatureId) => void;
  onSelectedCategoricalFeatureChange?: (feature: FeatureId) => void;
  onKChange?: (k: number) => void;
}

export function ScatterHistogram({
  patientsData,
  plottableFeatures = NEURO_PLOTTABLE_FEATURES,
  categoricalFeatures = NEURO_CATEGORICAL_FEATURES,
  selectedXFeature,
  selectedYFeature,
  selectedCategoricalFeature,
  k,
  defaultSelectedXFeature,
  defaultSelectedYFeature,
  defaultSelectedCategoricalFeature,
  defaultK = 3,
  initialXFeature,
  initialYFeature,
  initialCategoricalFeature,
  onSelectedXFeatureChange,
  onSelectedYFeatureChange,
  onSelectedCategoricalFeatureChange,
  onKChange,
}: ScatterHistogramProps) {
  const [xFeature, setXFeature] = useControllableState({
    value: selectedXFeature,
    defaultValue: defaultSelectedXFeature ?? initialXFeature ?? NEURO_INITIAL_SCATTER_FEATURES[0],
    onChange: onSelectedXFeatureChange,
  });
  const [yFeature, setYFeature] = useControllableState({
    value: selectedYFeature,
    defaultValue: defaultSelectedYFeature ?? initialYFeature ?? NEURO_INITIAL_SCATTER_FEATURES[1],
    onChange: onSelectedYFeatureChange,
  });
  const [categoricalFeature, setCategoricalFeature] = useControllableState({
    value: selectedCategoricalFeature,
    defaultValue: defaultSelectedCategoricalFeature ?? initialCategoricalFeature ?? "None",
    onChange: onSelectedCategoricalFeatureChange,
  });
  const [resolvedK] = useControllableState({
    value: k,
    defaultValue: defaultK,
    onChange: onKChange,
  });

  const isHistogram = xFeature === yFeature;

  return (
    <div className="neurodegenvis-card flex-container-column">
      <div className="pca-heading-container neurodegenvis-toolbar">
        <h4 className="plot-headings">{isHistogram ? yFeature : `${yFeature} vs ${xFeature}`}</h4>
        <div className="neurodegenvis-controls-grid">
          <label className="neurodegenvis-select-group">
            <span>X</span>
            <select
              className="single-select-dropdown"
              value={xFeature}
              onChange={(event) => setXFeature(event.target.value)}
            >
              {plottableFeatures.map((feature) => (
                <option key={feature} value={feature}>
                  {feature}
                </option>
              ))}
            </select>
          </label>
          <label className="neurodegenvis-select-group">
            <span>Y</span>
            <select
              className="single-select-dropdown"
              value={yFeature}
              onChange={(event) => setYFeature(event.target.value)}
            >
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
          kMeanClusters={resolvedK}
        />
      ) : (
        <NeuroScatterplot
          xFeature={xFeature}
          yFeature={yFeature}
          patientsData={patientsData}
          categoricalFeature={categoricalFeature}
          kMeanClusters={resolvedK}
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
