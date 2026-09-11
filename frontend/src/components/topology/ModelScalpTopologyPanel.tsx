import { BranchToggle } from "../ui/BranchToggle";
import { useFeatureMode } from "../../vacp/useFeatureMode";
import { useMemo, useState } from "react";

import { EEG_MODEL_NOTATION, EEG_MODEL_NOTATION_LABELS } from "../../constants/eegModelNotation";
import type { ModelBandPresentation, TimeseriesBandFilter } from "../../types";
import { MathFormula } from "../ui";
import { ScalpTopologyPlot } from "./ScalpTopologyPlot";
import { findScalpBand, getRangeFromResponse, type ScalpTopologyValueChannel } from "./scalpTopologyUtils";
import { useModelScalpTopologies } from "./useModelScalpTopologies";
import "./TopologyAttributionPanel.css";

interface ModelScalpTopologyPanelProps {
  modelName?: string | null;
  compact?: boolean;
  hasSCC?: boolean;
}

export function ModelScalpTopologyPanel({ modelName, compact = false, hasSCC = false }: ModelScalpTopologyPanelProps) {
  const [branch, setBranch] = useFeatureMode("overview/spatial-weights-branch", hasSCC, "bp", ["bp", "scc"] as const);
  const [selectedBand, setSelectedBand] = useState<TimeseriesBandFilter | null>("alpha");
  const { scalpTopologies, isLoading, error } = useModelScalpTopologies(modelName, branch);
  const activeBand = useMemo(() => findScalpBand(scalpTopologies, selectedBand), [scalpTopologies, selectedBand]);
  const bandOptions = useMemo(
    () =>
      (scalpTopologies?.bands ?? []).map((band) => ({
        band: band.band,
        label: `${band.band} (${band.start_hz}–${band.end_hz} Hz)`,
      })),
    [scalpTopologies],
  );
  const channels = useMemo<ScalpTopologyValueChannel[]>(
    () =>
      activeBand?.channels.map((channel) => ({
        name: channel.name,
        x: channel.x,
        y: channel.y,
        value: channel.weight,
      })) ?? [],
    [activeBand],
  );

  return (
    <div className={`topology-panel topology-panel--model${compact ? " topology-panel--compact" : ""}`}>
      <div className="topology-panel-header">
        <h3 className="topology-panel-title">{compact ? "Spatial Weights" : "Model Scalp View"}</h3>
        <div className="topology-panel-model-header-controls">
          <p className="topology-panel-stage">
            {branch === "scc" ? "SCC node weights" : EEG_MODEL_NOTATION_LABELS.spatialLayer}{" "}
            <MathFormula tex={branch === "scc" ? "w_{f,c}^{SCC}" : EEG_MODEL_NOTATION.spatialWeight} />
          </p>
          {hasSCC && <BranchToggle value={branch} onChange={setBranch} label="Spatial weights branch" />}
        </div>
      </div>

      <BandSelector
        bands={bandOptions}
        selectedBand={activeBand?.band ?? selectedBand}
        onSelectedBandChange={setSelectedBand}
        compact={compact}
      />

      <div className="topology-panel-plot-shell">
        <ScalpTopologyPlot
          grid={scalpTopologies?.grid ?? null}
          gridValues={activeBand?.grid_values ?? []}
          channels={channels}
          valueRange={getRangeFromResponse(scalpTopologies)}
          unitLabel={scalpTopologies?.unit_label ?? "W"}
          colorMode="diverging"
          isLoading={isLoading}
          error={error}
          emptyMessage="No model scalp topology data available."
          compact={compact}
          ariaLabel={branch === "scc" ? "SCC node weight topomap" : "Model spatial weight topomap"}
        />
      </div>
    </div>
  );
}

interface BandSelectorProps {
  bands: Array<
    Pick<ModelBandPresentation, "band" | "label"> & Partial<Pick<ModelBandPresentation, "start_hz" | "end_hz">>
  >;
  selectedBand: TimeseriesBandFilter | null;
  onSelectedBandChange: (band: TimeseriesBandFilter) => void;
  compact?: boolean;
}

export function BandSelector({ bands, selectedBand, onSelectedBandChange, compact = false }: BandSelectorProps) {
  return (
    <div
      className={`topology-panel-band-selector${compact ? " topology-panel-band-selector--compact" : ""}`}
      aria-label="Band selector"
    >
      {bands.map((band) => (
        <button
          key={band.band}
          type="button"
          className={`topology-panel-band-button${
            selectedBand === band.band ? " topology-panel-band-button--active" : ""
          }`}
          title={band.start_hz !== undefined ? `${band.label}: ${band.start_hz}–${band.end_hz} Hz` : band.label}
          onClick={() => onSelectedBandChange(band.band)}
        >
          {band.band}
        </button>
      ))}
    </div>
  );
}

export type { ModelScalpTopologyPanelProps };
