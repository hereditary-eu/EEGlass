import { useEffect, useMemo, useRef, useState } from "react";

import { TimeseriesService } from "../../services/TimeseriesService";
import { useAppStore } from "../../stores/useAppStore";
import type { ModelScalpTopologyBand, ModelScalpTopologyResponse, TimeseriesBandFilter } from "../../types";
import "./TopologyAttributionPanel.css";

const BAND_OPTIONS = ["delta", "theta", "alpha", "beta1", "beta2", "beta3", "gamma"] as const satisfies readonly TimeseriesBandFilter[];
const TOPOLOGY_VIEWBOX = {
  minX: -1.18,
  minY: -1.16,
  width: 2.36,
  height: 2.42,
};
const ZERO_WEIGHT_COLOR = { r: 228, g: 238, b: 241, a: 0.58 };
const DISPLAY_CHANNEL_POSITIONS: Record<string, { x: number; y: number }> = {
  Fp1: { x: -0.22, y: -0.74 },
  Fp2: { x: 0.22, y: -0.74 },
  F7: { x: -0.68, y: -0.5 },
  F3: { x: -0.36, y: -0.5 },
  Fz: { x: 0, y: -0.5 },
  F4: { x: 0.36, y: -0.5 },
  F8: { x: 0.68, y: -0.5 },
  T3: { x: -0.78, y: -0.08 },
  C3: { x: -0.4, y: -0.08 },
  Cz: { x: 0, y: -0.08 },
  C4: { x: 0.4, y: -0.08 },
  T4: { x: 0.78, y: -0.08 },
  T5: { x: -0.62, y: 0.36 },
  P3: { x: -0.32, y: 0.36 },
  Pz: { x: 0, y: 0.36 },
  P4: { x: 0.32, y: 0.36 },
  T6: { x: 0.62, y: 0.36 },
  O1: { x: -0.22, y: 0.68 },
  O2: { x: 0.22, y: 0.68 },
};

let scalpTopologyCache: ModelScalpTopologyResponse | null = null;
let scalpTopologyPromise: Promise<ModelScalpTopologyResponse> | null = null;

export function TopologyAttributionPanel() {
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [plotSize, setPlotSize] = useState(0);
  const [selectedBand, setSelectedBand] = useState<TimeseriesBandFilter>(BAND_OPTIONS[0]);
  const [applyBandFilterOnClick, setApplyBandFilterOnClick] = useState(false);
  const [scalpTopologies, setScalpTopologies] = useState<ModelScalpTopologyResponse | null>(scalpTopologyCache);
  const [isLoading, setIsLoading] = useState(!scalpTopologyCache);
  const [error, setError] = useState<string | null>(null);
  const setSelectedChannels = useAppStore((state) => state.setSelectedChannels);
  const selectedTimeseriesBandFilter = useAppStore((state) => state.selectedTimeseriesBandFilter);
  const setSelectedTimeseriesBandFilter = useAppStore((state) => state.setSelectedTimeseriesBandFilter);
  const selectedChannels = useAppStore((state) => state.selectedChannels);

  useEffect(() => {
    const element = plotRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextSize = Math.max(0, Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height) - 12));
      setPlotSize((current) => (current !== nextSize ? nextSize : current));
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    let isCurrent = true;

    if (scalpTopologyCache) {
      setScalpTopologies(scalpTopologyCache);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    scalpTopologyPromise ??= TimeseriesService.getScalpTopologies();

    scalpTopologyPromise
      .then((response) => {
        scalpTopologyCache = response;
        if (!isCurrent) {
          return;
        }

        setScalpTopologies(response);
        setIsLoading(false);
      })
      .catch((loadError) => {
        scalpTopologyPromise = null;
        if (!isCurrent) {
          return;
        }

        setScalpTopologies(null);
        setIsLoading(false);
        setError(getScalpTopologyErrorMessage(loadError));
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const activeBand = useMemo<ModelScalpTopologyBand | null>(() => {
    if (!scalpTopologies?.bands.length) {
      return null;
    }

    return scalpTopologies.bands.find((band) => band.band === selectedBand) ?? scalpTopologies.bands[0];
  }, [scalpTopologies, selectedBand]);
  const displayedChannels = useMemo(
    () => activeBand?.channels.map((channel) => ({ ...channel, ...getDisplayChannelPosition(channel) })) ?? [],
    [activeBand],
  );

  useEffect(() => {
    if (applyBandFilterOnClick) {
      setSelectedTimeseriesBandFilter(selectedBand);
    }
  }, [applyBandFilterOnClick, selectedBand, setSelectedTimeseriesBandFilter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const band = activeBand;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const size = 420;
    canvas.width = size;
    canvas.height = size;
    context.clearRect(0, 0, size, size);

    const topologyGrid = scalpTopologies?.grid;
    if (!band || !scalpTopologies || !topologyGrid) {
      return;
    }

    const minWeight = scalpTopologies.global_min_weight;
    const maxWeight = scalpTopologies.global_max_weight;
    const range = maxWeight - minWeight;
    if (!Number.isFinite(range) || range <= 0) {
      return;
    }

    const resolution = topologyGrid.resolution;
    const expectedGridSize = resolution * resolution;
    if (
      resolution <= 0 ||
      topologyGrid.x.length < expectedGridSize ||
      topologyGrid.y.length < expectedGridSize ||
      band.grid_values.length < expectedGridSize
    ) {
      return;
    }

    const zeroPosition = clamp((0 - minWeight) / range, 0, 1);
    const gridCanvas = document.createElement("canvas");
    gridCanvas.width = resolution;
    gridCanvas.height = resolution;
    const gridContext = gridCanvas.getContext("2d");
    if (!gridContext) {
      return;
    }

    const image = gridContext.createImageData(resolution, resolution);
    for (let index = 0; index < expectedGridSize; index += 1) {
      const plotX = topologyGrid.x[index];
      const plotY = topologyGrid.y[index];
      const interpolatedWeight = band.grid_values[index];
      const pixelX = index % resolution;
      const pixelY = resolution - 1 - Math.floor(index / resolution);
      const pixelIndex = (pixelY * resolution + pixelX) * 4;
      if (!Number.isFinite(plotX) || !Number.isFinite(plotY) || !Number.isFinite(interpolatedWeight)) {
        continue;
      }

      const distanceFromCenter = Math.sqrt(plotX * plotX + plotY * plotY);
      if (distanceFromCenter > 1) {
        image.data[pixelIndex + 3] = 0;
        continue;
      }

      const normalized = clamp((interpolatedWeight - minWeight) / range, 0, 1);
      const edgeFade = clamp(1 - Math.max(0, distanceFromCenter - 0.94) / 0.06, 0, 1);
      const color = getTopologyColor(normalized, zeroPosition);

      image.data[pixelIndex] = color.r;
      image.data[pixelIndex + 1] = color.g;
      image.data[pixelIndex + 2] = color.b;
      image.data[pixelIndex + 3] = Math.round(color.a * 255 * edgeFade);
    }

    gridContext.putImageData(image, 0, 0);

    const [minGridX, maxGridX] = getExtent(topologyGrid.x);
    const [minGridY, maxGridY] = getExtent(topologyGrid.y);
    const targetX = mapPlotXToCanvas(minGridX, size);
    const targetY = mapPlotYToCanvas(minGridY, size);
    const targetWidth = mapPlotXToCanvas(maxGridX, size) - targetX;
    const targetHeight = mapPlotYToCanvas(maxGridY, size) - targetY;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(gridCanvas, targetX, targetY, targetWidth, targetHeight);
  }, [activeBand, scalpTopologies]);

  const zeroLabelStyle = useMemo(() => {
    if (!scalpTopologies) {
      return { top: "50%" };
    }

    const { global_min_weight: minWeight, global_max_weight: maxWeight } = scalpTopologies;
    const range = maxWeight - minWeight;
    if (!Number.isFinite(range) || range <= 0 || minWeight > 0 || maxWeight < 0) {
      return { top: "50%" };
    }

    const topPercent = ((maxWeight - 0) / range) * 100;
    return { top: `${clamp(topPercent, 0, 100)}%` };
  }, [scalpTopologies]);

  return (
    <div className="topology-panel">
      <div className="topology-panel-header">
        <div>
          <h3 className="topology-panel-title">Scalp view</h3>
        </div>
      </div>

      <div className="topology-panel-band-selector" aria-label="Bandfilter selector">
        {BAND_OPTIONS.map((band) => (
          <button
            key={band}
            type="button"
            className={`topology-panel-band-button${selectedBand === band ? " topology-panel-band-button--active" : ""}`}
            onClick={() => setSelectedBand(band)}
          >
            {band}
          </button>
        ))}
      </div>
      <label className="topology-panel-filter-toggle">
        <input
          type="checkbox"
          checked={applyBandFilterOnClick}
          onChange={(event) => {
            const shouldApplyFilter = event.currentTarget.checked;
            setApplyBandFilterOnClick(shouldApplyFilter);
            setSelectedTimeseriesBandFilter(shouldApplyFilter ? selectedBand : null);
          }}
        />
        <span>Apply selected band to timeseries clicks</span>
        {selectedTimeseriesBandFilter ? (
          <strong className="topology-panel-filter-state">{selectedTimeseriesBandFilter}</strong>
        ) : null}
      </label>

      <div className="topology-panel-plot-shell">
        <div className="topology-panel-plot-layout">
          <div className="topology-panel-plot" ref={plotRef}>
            <div
              className="topology-panel-plot-inner"
              style={plotSize > 0 ? { width: `${plotSize}px`, height: `${plotSize}px` } : undefined}
            >
              <canvas className="topology-panel-canvas" ref={canvasRef} aria-hidden="true" />
              <svg
                className="topology-panel-svg"
                viewBox={`${TOPOLOGY_VIEWBOX.minX} ${TOPOLOGY_VIEWBOX.minY} ${TOPOLOGY_VIEWBOX.width} ${TOPOLOGY_VIEWBOX.height}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="EEG topology plot"
              >
                <circle className="topology-panel-head-fill" cx="0" cy="0" r="1" />
                <circle className="topology-panel-head-stroke" cx="0" cy="0" r="1" />
                <path className="topology-panel-ear" d="M-1.02 -0.18 C-1.18 -0.08 -1.18 0.08 -1.02 0.18" />
                <path className="topology-panel-ear" d="M1.02 -0.18 C1.18 -0.08 1.18 0.08 1.02 0.18" />
                <path className="topology-panel-nose" d="M-0.12 -0.98 L0 -1.12 L0.12 -0.98" />

                {displayedChannels.map((channel) => (
                  <g key={channel.name}>
                    <text
                      x={channel.x}
                      y={channel.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className={`topology-panel-electrode-label${selectedChannels.includes(channel.name) ? " topology-panel-electrode-label--active" : ""}`}
                      onClick={() => {
                        setSelectedChannels([channel.name]);
                        if (applyBandFilterOnClick) {
                          setSelectedTimeseriesBandFilter(selectedBand);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedChannels([channel.name]);
                          if (applyBandFilterOnClick) {
                            setSelectedTimeseriesBandFilter(selectedBand);
                          }
                        }
                      }}
                    >
                      {channel.name}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {isLoading ? <div className="topology-panel-overlay">Loading scalp view...</div> : null}
            {error ? <div className="topology-panel-overlay topology-panel-overlay--error">{error}</div> : null}
            {!isLoading && !error && !activeBand ? (
              <div className="topology-panel-overlay">No scalp topology data available.</div>
            ) : null}
          </div>

          <div className="topology-panel-colormap" aria-hidden="true">
            <div className="topology-panel-colormap-row topology-panel-colormap-row--max">
              <div className="topology-panel-colormap-end-label">
                <i>W</i> ({scalpTopologies ? formatLegendValue(scalpTopologies.global_max_weight) : "..."})
              </div>
            </div>
            <div className="topology-panel-colormap-scale">
              <div className="topology-panel-colormap-bar" />
              <span className="topology-panel-colormap-zero" style={zeroLabelStyle}>
                0
              </span>
            </div>
            <div className="topology-panel-colormap-row topology-panel-colormap-row--min">
              <div className="topology-panel-colormap-end-label">
                <i>W</i> ({scalpTopologies ? formatLegendValue(scalpTopologies.global_min_weight) : "..."})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTopologyColor(value: number, zeroPosition: number) {
  const clampedValue = clamp(value, 0, 1);
  const clampedZero = clamp(zeroPosition, 0.001, 0.999);

  if (clampedValue <= clampedZero) {
    return mixColor(
      { r: 8, g: 106, b: 136, a: 0.9 },
      ZERO_WEIGHT_COLOR,
      clampedValue / clampedZero,
    );
  }

  return mixColor(
    ZERO_WEIGHT_COLOR,
    { r: 225, g: 29, b: 72, a: 0.9 },
    (clampedValue - clampedZero) / (1 - clampedZero),
  );
}

function getDisplayChannelPosition(channel: { name: string; x: number; y: number }) {
  return DISPLAY_CHANNEL_POSITIONS[channel.name] ?? { x: channel.x, y: channel.y };
}

function mapPlotXToCanvas(value: number, canvasSize: number): number {
  return ((value - TOPOLOGY_VIEWBOX.minX) / TOPOLOGY_VIEWBOX.width) * canvasSize;
}

function mapPlotYToCanvas(value: number, canvasSize: number): number {
  return ((value - TOPOLOGY_VIEWBOX.minY) / TOPOLOGY_VIEWBOX.height) * canvasSize;
}

function getExtent(values: number[]): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }

    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : [-1, 1];
}

function mixColor(
  start: { r: number; g: number; b: number; a: number },
  end: { r: number; g: number; b: number; a: number },
  t: number,
) {
  return {
    r: Math.round(start.r + (end.r - start.r) * t),
    g: Math.round(start.g + (end.g - start.g) * t),
    b: Math.round(start.b + (end.b - start.b) * t),
    a: start.a + (end.a - start.a) * t,
  };
}

function formatLegendValue(value: number): string {
  return value.toFixed(3);
}

function getScalpTopologyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to load scalp topologies: ${error.message}`;
  }

  return "Unable to load scalp topologies.";
}

export type TopologyAttributionPanelProps = Record<string, never>;
