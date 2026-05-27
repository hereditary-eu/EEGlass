import { useMemo, useState } from "react";

import type { TimeseriesBandFilter } from "../../types";
import { MathFormula } from "../ui";
import { ScalpTopologyPlot } from "./ScalpTopologyPlot";
import {
  findScalpBand,
  getRangeFromResponse,
  SCALP_BAND_OPTIONS,
  type ScalpTopologyValueChannel,
} from "./scalpTopologyUtils";
import { useModelScalpTopologies } from "./useModelScalpTopologies";
import "./TopologyAttributionPanel.css";

interface ModelScalpTopologyPanelProps {
  modelName?: string | null;
  compact?: boolean;
}

export function ModelScalpTopologyPanel({ modelName, compact = false }: ModelScalpTopologyPanelProps) {
  const [selectedBand, setSelectedBand] = useState<TimeseriesBandFilter>(SCALP_BAND_OPTIONS[0]);
  const { scalpTopologies, isLoading, error } = useModelScalpTopologies(modelName);
  const activeBand = useMemo(() => findScalpBand(scalpTopologies, selectedBand), [scalpTopologies, selectedBand]);
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

      <BandSelector selectedBand={selectedBand} onSelectedBandChange={setSelectedBand} compact={compact} />

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
  selectedBand: TimeseriesBandFilter;
  onSelectedBandChange: (band: TimeseriesBandFilter) => void;
  compact?: boolean;
}

export function BandSelector({ selectedBand, onSelectedBandChange, compact = false }: BandSelectorProps) {
  return (
    <div
      className={`topology-panel-band-selector${compact ? " topology-panel-band-selector--compact" : ""}`}
      aria-label="Band selector"
    >
      {SCALP_BAND_OPTIONS.map((band) => (
        <button
          key={band}
          type="button"
          className={`topology-panel-band-button${selectedBand === band ? " topology-panel-band-button--active" : ""}`}
          onClick={() => onSelectedBandChange(band)}
        >
          {band}
        </button>
      ))}
    </div>
  );
}

export type { ModelScalpTopologyPanelProps };
