import { useEffect, useMemo, useState } from "react";

import { ModelService } from "../../services/ModelService";
import { useAppStore } from "../../stores/useAppStore";
import type {
  ChannelId,
  ModelInfoResponse,
  ModelWindowScalpTopologyBand,
  ModelWindowScalpTopologyResponse,
  TimeseriesSource,
} from "../../types";
import { ComponentStatusIndicator, MathFormula } from "../ui";
import { BandSelector } from "./ModelScalpTopologyPanel";
import { ScalpTopologyPlot } from "./ScalpTopologyPlot";
import { SCALP_BAND_OPTIONS, type ScalpTopologyValueChannel } from "./scalpTopologyUtils";
import "./TopologyAttributionPanel.css";

interface EegScalpTopologyPanelProps {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  modelInfo: ModelInfoResponse | null;
  windowIndex: number | null;
  selectedChannels: ChannelId[];
  onChannelSelect: (channel: ChannelId) => void;
}

export function EegScalpTopologyPanel({
  datasetId,
  subjectId,
  source,
  modelInfo,
  windowIndex,
  selectedChannels,
  onChannelSelect,
}: EegScalpTopologyPanelProps) {
  const [applyBandFilterOnClick, setApplyBandFilterOnClick] = useState(false);
  const [scalpTopologies, setScalpTopologies] = useState<ModelWindowScalpTopologyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedScalpBand = useAppStore((state) => state.selectedScalpBand);
  const setSelectedScalpBand = useAppStore((state) => state.setSelectedScalpBand);
  const selectedTimeseriesBandFilter = useAppStore((state) => state.selectedTimeseriesBandFilter);
  const setSelectedTimeseriesBandFilter = useAppStore((state) => state.setSelectedTimeseriesBandFilter);
  const modelName = modelInfo?.name ?? undefined;

  useEffect(() => {
    if (applyBandFilterOnClick) {
      setSelectedTimeseriesBandFilter(selectedScalpBand);
    }
  }, [applyBandFilterOnClick, selectedScalpBand, setSelectedTimeseriesBandFilter]);

  useEffect(() => {
    let isCurrent = true;

    if (!datasetId || !subjectId || !modelName || windowIndex === null || windowIndex < 0) {
      setScalpTopologies(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    ModelService.getWindowScalpTopologies(datasetId, subjectId, windowIndex, source, modelName)
      .then((response) => {
        if (!isCurrent) {
          return;
        }

        setScalpTopologies(response);
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setScalpTopologies(null);
        setError(getWindowScalpTopologyErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [datasetId, modelName, source, subjectId, windowIndex]);

  const activeMode = useMemo(
    () => scalpTopologies?.modes.find((mode) => mode.mode === "weighted_contribution") ?? null,
    [scalpTopologies],
  );
  const activeBand = useMemo(
    () => activeMode?.bands.find((band) => band.band === selectedScalpBand) ?? activeMode?.bands[0] ?? null,
    [activeMode, selectedScalpBand],
  );
  const bandValueRange = useMemo(() => getPerBandDivergingValueRange(activeBand), [activeBand]);
  const channels = useMemo<ScalpTopologyValueChannel[]>(
    () =>
      activeBand?.channels.map((channel) => ({
        name: channel.name,
        x: channel.x,
        y: channel.y,
        value: channel.value,
      })) ?? [],
    [activeBand],
  );
  const subtitle =
    scalpTopologies && activeMode
      ? `Window ${scalpTopologies.window_index + 1}: ${scalpTopologies.start_time.toFixed(1)}s-${scalpTopologies.end_time.toFixed(1)}s - ${selectedScalpBand} spatial evidence`
      : "";
  const status = getScalpStatus({ error, isLoading, scalpTopologies });

  return (
    <div className="topology-panel topology-panel--eeg">
      <div className="topology-panel-header">
        <div>
          <h3 className="topology-panel-title">Scalp view</h3>
          <p className="topology-panel-subtitle">{subtitle}</p>
        </div>
        <p className="topology-panel-stage">
          <span className="topology-panel-stage-text">
            Spatial layer evidence from <MathFormula tex={"w_{f,c}"} /> and window band power before{" "}
            <MathFormula tex={"X_f(t)=\\sum_c w_{f,c}W_{c,f}(t)"} />
          </span>
          <ComponentStatusIndicator status={status.status} label={status.label} />
        </p>
      </div>

      <div className="topology-panel-controls">
        <BandSelector selectedBand={selectedScalpBand} onSelectedBandChange={setSelectedScalpBand} />
      </div>

      <label className="topology-panel-filter-toggle">
        <input
          type="checkbox"
          checked={applyBandFilterOnClick}
          onChange={(event) => {
            const shouldApplyFilter = event.currentTarget.checked;
            setApplyBandFilterOnClick(shouldApplyFilter);
            setSelectedTimeseriesBandFilter(shouldApplyFilter ? selectedScalpBand : null);
          }}
        />
        <span>Apply selected band to timeseries clicks</span>
        {selectedTimeseriesBandFilter ? (
          <strong className="topology-panel-filter-state">{selectedTimeseriesBandFilter}</strong>
        ) : null}
      </label>

      <div className="topology-panel-plot-shell">
        <ScalpTopologyPlot
          grid={scalpTopologies?.grid ?? null}
          gridValues={activeBand?.grid_values ?? []}
          channels={channels}
          valueRange={bandValueRange}
          unitLabel="evidence"
          colorMode="diverging"
          selectedChannels={selectedChannels}
          onChannelSelect={(channel) => {
            onChannelSelect(channel);
            if (applyBandFilterOnClick) {
              setSelectedTimeseriesBandFilter(selectedScalpBand);
            }
          }}
          isLoading={isLoading}
          error={error}
          showStatusOverlay={false}
          emptyMessage="Click a 4s prediction window to inspect spatial evidence."
          ariaLabel="Window scalp topology plot"
        />
      </div>
    </div>
  );
}

function getWindowScalpTopologyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to load window scalp topology: ${error.message}`;
  }

  return "Unable to load window scalp topology.";
}

function getPerBandDivergingValueRange(band: ModelWindowScalpTopologyBand | null): { min: number; max: number } {
  const values = [...(band?.grid_values ?? []), ...(band?.channels.map((channel) => channel.value) ?? [])].filter(
    (value) => Number.isFinite(value),
  );
  const maxAbs = values.reduce((currentMax, value) => Math.max(currentMax, Math.abs(value)), 0);
  const scale = maxAbs > 0 ? maxAbs : 1;

  return { min: -scale, max: scale };
}

function getScalpStatus({
  error,
  isLoading,
  scalpTopologies,
}: {
  error: string | null;
  isLoading: boolean;
  scalpTopologies: ModelWindowScalpTopologyResponse | null;
}): { status: "idle" | "loading" | "loaded" | "error"; label: string } {
  if (error) {
    return { status: "error", label: error };
  }

  if (isLoading) {
    return { status: "loading", label: "Loading scalp view" };
  }

  if (scalpTopologies) {
    return { status: "loaded", label: "Scalp view loaded" };
  }

  return { status: "idle", label: "Scalp view idle" };
}

export type { EegScalpTopologyPanelProps };
