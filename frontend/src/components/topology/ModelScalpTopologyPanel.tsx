import { useMemo, useState } from "react";

import type { ModelBandPresentation, TimeseriesBandFilter } from "../../types";
import { MathFormula } from "../ui";
import { ScalpTopologyPlot } from "./ScalpTopologyPlot";
import {
  findScalpBand,
  getRangeFromResponse,
  type ScalpTopologyValueChannel,
} from "./scalpTopologyUtils";
import { useModelScalpTopologies } from "./useModelScalpTopologies";
import "./TopologyAttributionPanel.css";

interface ModelScalpTopologyPanelProps {
  modelName?: string | null;
  compact?: boolean;
}

export function ModelScalpTopologyPanel({ modelName, compact = false }: ModelScalpTopologyPanelProps) {
  const [selectedBand, setSelectedBand] = useState<TimeseriesBandFilter | null>(null);
  const { scalpTopologies, isLoading, error } = useModelScalpTopologies(modelName);
  const activeBand = useMemo(() => findScalpBand(scalpTopologies, selectedBand), [scalpTopologies, selectedBand]);
  const bandOptions = useMemo(
    () =>
      (scalpTopologies?.bands ?? []).map((band) => ({
        band: band.band,
        label: band.band,
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
        <h3 className="topology-panel-title">{compact ? "Spatial weights" : "Model scalp view"}</h3>
        <p className="topology-panel-stage">
          Spatial layer: learned channel weights <MathFormula tex={"w_{f,c}"} />
        </p>
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
          ariaLabel="Model spatial weight topomap"
        />
      </div>
    </div>
  );
}

interface BandSelectorProps {
  bands: Array<Pick<ModelBandPresentation, "band" | "label">>;
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
          onClick={() => onSelectedBandChange(band.band)}
        >
          {band.label}
        </button>
      ))}
    </div>
  );
}

export type { ModelScalpTopologyPanelProps };
