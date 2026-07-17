import { useEffect, useMemo, useRef, useState } from "react";

import type { ChannelId, ModelScalpTopologyGrid } from "../../types";
import { formatScalpValue, type ScalpTopologyValueChannel, type ScalpTopologyValueRange } from "./scalpTopologyUtils";

export type ScalpTopologyColorMode = "diverging" | "sequential";

export interface ScalpTopologyPlotProps {
  grid: ModelScalpTopologyGrid | null;
  gridValues: number[];
  channels: ScalpTopologyValueChannel[];
  valueRange: ScalpTopologyValueRange;
  unitLabel: string;
  colorMode: ScalpTopologyColorMode;
  selectedChannels?: ChannelId[];
  onChannelSelect?: (channel: ChannelId) => void;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  loadingMessage?: string;
  ariaLabel?: string;
  compact?: boolean;
  showStatusOverlay?: boolean;
}

const TOPOLOGY_VIEWBOX = {
  minX: -1.18,
  minY: -1.16,
  width: 2.36,
  height: 2.42,
};
const ZERO_VALUE_COLOR = { r: 228, g: 238, b: 241, a: 0.58 };
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

export function ScalpTopologyPlot({
  grid,
  gridValues,
  channels,
  valueRange,
  unitLabel,
  colorMode,
  selectedChannels = [],
  onChannelSelect,
  isLoading = false,
  error = null,
  emptyMessage = "No scalp topology data available.",
  loadingMessage = "Loading scalp view...",
  ariaLabel = "EEG topology plot",
  compact = false,
  showStatusOverlay = true,
}: ScalpTopologyPlotProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [plotSize, setPlotSize] = useState(0);
  const displayedChannels = useMemo(
    () => channels.map((channel) => ({ ...channel, ...getDisplayChannelPosition(channel) })),
    [channels],
  );
  const hasData = Boolean(grid && gridValues.length && displayedChannels.length);
  const safeValueRange = useMemo(() => normalizeValueRange(valueRange, colorMode), [colorMode, valueRange]);
  const isChannelInteractive = Boolean(onChannelSelect);

  useEffect(() => {
    const element = plotRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const nextSize = Math.max(0, Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height) - 12));
      setPlotSize((current) => (current !== nextSize ? nextSize : current));
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
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

    if (!grid || !hasData) {
      return;
    }

    const range = safeValueRange.max - safeValueRange.min;
    if (!Number.isFinite(range) || range <= 0) {
      return;
    }

    const resolution = grid.resolution;
    const expectedGridSize = resolution * resolution;
    if (
      resolution <= 0 ||
      grid.x.length < expectedGridSize ||
      grid.y.length < expectedGridSize ||
      gridValues.length < expectedGridSize
    ) {
      return;
    }

    const zeroPosition = colorMode === "diverging" ? clamp((0 - safeValueRange.min) / range, 0, 1) : 0;
    const gridCanvas = document.createElement("canvas");
    gridCanvas.width = resolution;
    gridCanvas.height = resolution;
    const gridContext = gridCanvas.getContext("2d");
    if (!gridContext) {
      return;
    }

    const image = gridContext.createImageData(resolution, resolution);
    for (let index = 0; index < expectedGridSize; index += 1) {
      const plotX = grid.x[index];
      const plotY = grid.y[index];
      const interpolatedValue = gridValues[index];
      const pixelX = index % resolution;
      const pixelY = resolution - 1 - Math.floor(index / resolution);
      const pixelIndex = (pixelY * resolution + pixelX) * 4;
      if (
        typeof plotX !== "number" ||
        typeof plotY !== "number" ||
        typeof interpolatedValue !== "number" ||
        !Number.isFinite(plotX) ||
        !Number.isFinite(plotY) ||
        !Number.isFinite(interpolatedValue)
      ) {
        continue;
      }

      const distanceFromCenter = Math.sqrt(plotX * plotX + plotY * plotY);
      if (distanceFromCenter > 1) {
        image.data[pixelIndex + 3] = 0;
        continue;
      }

      const normalized = clamp((interpolatedValue - safeValueRange.min) / range, 0, 1);
      const edgeFade = clamp(1 - Math.max(0, distanceFromCenter - 0.94) / 0.06, 0, 1);
      const color =
        colorMode === "sequential" ? getSequentialColor(normalized) : getDivergingColor(normalized, zeroPosition);

      image.data[pixelIndex] = color.r;
      image.data[pixelIndex + 1] = color.g;
      image.data[pixelIndex + 2] = color.b;
      image.data[pixelIndex + 3] = Math.round(color.a * 255 * edgeFade);
    }

    gridContext.putImageData(image, 0, 0);

    const [minGridX, maxGridX] = getExtent(grid.x);
    const [minGridY, maxGridY] = getExtent(grid.y);
    const targetX = mapPlotXToCanvas(minGridX, size);
    const targetY = mapPlotYToCanvas(minGridY, size);
    const targetWidth = mapPlotXToCanvas(maxGridX, size) - targetX;
    const targetHeight = mapPlotYToCanvas(maxGridY, size) - targetY;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(gridCanvas, targetX, targetY, targetWidth, targetHeight);
  }, [colorMode, grid, gridValues, hasData, safeValueRange]);

  const zeroLabelStyle = useMemo(() => {
    const range = safeValueRange.max - safeValueRange.min;
    if (
      colorMode !== "diverging" ||
      !Number.isFinite(range) ||
      range <= 0 ||
      safeValueRange.min > 0 ||
      safeValueRange.max < 0
    ) {
      return null;
    }

    const topPercent = ((safeValueRange.max - 0) / range) * 100;
    return { top: `${clamp(topPercent, 0, 100)}%` };
  }, [colorMode, safeValueRange]);

  return (
    <div className={`topology-panel-plot-layout${compact ? " topology-panel-plot-layout--compact" : ""}`}>
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
            aria-label={ariaLabel}
          >
            <circle className="topology-panel-head-fill" cx="0" cy="0" r="1" />
            <circle className="topology-panel-head-stroke" cx="0" cy="0" r="1" />
            <path className="topology-panel-ear" d="M-1.02 -0.18 C-1.18 -0.08 -1.18 0.08 -1.02 0.18" />
            <path className="topology-panel-ear" d="M1.02 -0.18 C1.18 -0.08 1.18 0.08 1.02 0.18" />
            <path className="topology-panel-nose" d="M-0.12 -0.98 L0 -1.12 L0.12 -0.98" />

            {displayedChannels.map((channel) => (
              <text
                key={channel.name}
                x={channel.x}
                y={channel.y}
                textAnchor="middle"
                dy="0.08"
                className={[
                  "topology-panel-electrode-label",
                  isChannelInteractive ? "topology-panel-electrode-label--interactive" : "",
                  selectedChannels.includes(channel.name) ? " topology-panel-electrode-label--active" : "",
                ].join(" ")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={isChannelInteractive ? () => onChannelSelect?.(channel.name) : undefined}
                role={isChannelInteractive ? "button" : undefined}
                tabIndex={isChannelInteractive ? 0 : undefined}
                onKeyDown={(event) => {
                  if (!onChannelSelect || (event.key !== "Enter" && event.key !== " ")) {
                    return;
                  }

                  event.preventDefault();
                  onChannelSelect(channel.name);
                }}
              >
                {channel.name}
              </text>
            ))}
          </svg>
        </div>

        {showStatusOverlay && isLoading ? <div className="topology-panel-overlay">{loadingMessage}</div> : null}
        {showStatusOverlay && error ? (
          <div className="topology-panel-overlay topology-panel-overlay--error">{error}</div>
        ) : null}
        {!isLoading && !error && !hasData ? <div className="topology-panel-overlay">{emptyMessage}</div> : null}
      </div>

      <div className="topology-panel-colormap" aria-hidden="true">
        <div className="topology-panel-colormap-row topology-panel-colormap-row--max">
          <div className="topology-panel-colormap-end-label">
            {formatColormapEndLabel(unitLabel, safeValueRange.max, compact)}
          </div>
        </div>
        <div className="topology-panel-colormap-scale">
          <div className={`topology-panel-colormap-bar topology-panel-colormap-bar--${colorMode}`} />
          {zeroLabelStyle ? (
            <span className="topology-panel-colormap-zero" style={zeroLabelStyle}>
              0
            </span>
          ) : null}
        </div>
        <div className="topology-panel-colormap-row topology-panel-colormap-row--min">
          <div className="topology-panel-colormap-end-label">
            {formatColormapEndLabel(unitLabel, safeValueRange.min, compact)}
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeValueRange(valueRange: ScalpTopologyValueRange, colorMode: ScalpTopologyColorMode) {
  if (Number.isFinite(valueRange.min) && Number.isFinite(valueRange.max) && valueRange.max > valueRange.min) {
    return valueRange;
  }

  return colorMode === "sequential" ? { min: 0, max: 1 } : { min: -1, max: 1 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatColormapEndLabel(unitLabel: string, value: number, compact: boolean): string {
  const formattedValue = formatScalpValue(value);
  return compact ? formattedValue : `${unitLabel} (${formattedValue})`;
}

function getDivergingColor(value: number, zeroPosition: number) {
  const clampedValue = clamp(value, 0, 1);
  const clampedZero = clamp(zeroPosition, 0.001, 0.999);

  if (clampedValue <= clampedZero) {
    return mixColor({ r: 8, g: 106, b: 136, a: 0.9 }, ZERO_VALUE_COLOR, clampedValue / clampedZero);
  }

  return mixColor(ZERO_VALUE_COLOR, { r: 225, g: 29, b: 72, a: 0.9 }, (clampedValue - clampedZero) / (1 - clampedZero));
}

function getSequentialColor(value: number) {
  const clampedValue = clamp(value, 0, 1);
  return mixColor({ r: 232, g: 241, b: 244, a: 0.66 }, { r: 8, g: 106, b: 136, a: 0.92 }, clampedValue);
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
