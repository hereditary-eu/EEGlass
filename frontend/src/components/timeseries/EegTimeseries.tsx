import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

import type { ChannelId, TimeRange } from "../../types";
import { useControllableState } from "../../utils/useControllableState";
import "./EegTimeseries.css";

interface TimeseriesView {
  xScale: number;
  xOffset: number;
  yMin: number;
  yMax: number;
}

interface DragState {
  mode: "pan" | "select";
  startX: number;
  startY: number;
  startOffset: number;
  startTime?: number;
  currentX?: number;
}

interface PlotGeometry {
  width: number;
  height: number;
  plotWidth: number;
  plotHeight: number;
  axisY: number;
  annotationTop: number;
  annotationBottom: number;
}

export type TimeseriesWindowAnnotationValue = number | string | null;

export interface TimeseriesWindowAnnotationRow {
  id: string;
  label?: string;
  values?: TimeseriesWindowAnnotationValue[];
  colors?: Array<string | null>;
  defaultColor?: string;
}

export interface EegTimeseriesProps {
  samples: Record<ChannelId, number[]>;
  samplingFrequency: number;
  channels: ChannelId[];
  windowSizeSeconds?: number;
  windowAnnotationRows?: TimeseriesWindowAnnotationRow[];
  selectedTimeRange?: TimeRange | null;
  defaultSelectedTimeRange?: TimeRange | null;
  onSelectedTimeRangeChange?: (timeRange: TimeRange | null) => void;
  hoveredChannel?: ChannelId | null;
  defaultHoveredChannel?: ChannelId | null;
  onHoveredChannelChange?: (channel: ChannelId | null) => void;
  resetViewSignal?: number;
  isPreview?: boolean;
  isLoading?: boolean;
  error?: string | null;
  onResetView?: () => void;
}

const PADDING = {
  left: 58,
  right: 24,
  top: 18,
  bottom: 10,
};

const X_AXIS_HEIGHT = 24;
const WINDOW_ANNOTATION_ROW_COUNT = 3;
const WINDOW_ANNOTATION_ROW_HEIGHT = 14;
const WINDOW_ANNOTATION_ROW_GAP = 3;
const WINDOW_ANNOTATION_TOP_GAP = 8;
const DEFAULT_WINDOW_SIZE_SECONDS = 2;
const CHANNEL_COLORS = ["#0f6ea8", "#be185d", "#15803d", "#b45309", "#6d28d9"];
const DEFAULT_WINDOW_ANNOTATION_ROWS: TimeseriesWindowAnnotationRow[] = [
  { id: "annotation-row-1" },
  { id: "annotation-row-2" },
  { id: "annotation-row-3" },
];

export function EegTimeseries({
  samples,
  samplingFrequency,
  channels,
  windowSizeSeconds = DEFAULT_WINDOW_SIZE_SECONDS,
  windowAnnotationRows = DEFAULT_WINDOW_ANNOTATION_ROWS,
  selectedTimeRange,
  defaultSelectedTimeRange = null,
  onSelectedTimeRangeChange,
  hoveredChannel,
  defaultHoveredChannel = null,
  onHoveredChannelChange,
  resetViewSignal = 0,
  isLoading = false,
  error,
  onResetView,
}: EegTimeseriesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousResetViewSignalRef = useRef(resetViewSignal);
  const viewSnapshotRef = useRef<{ duration: number; plotWidth: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<TimeseriesView>(() => createInitialView(samples, channels));
  const [drag, setDrag] = useState<DragState | null>(null);
  const viewRef = useRef(view);
  const dragRef = useRef<DragState | null>(null);
  const [resolvedSelectedTimeRange, setSelectedTimeRange] = useControllableState({
    value: selectedTimeRange,
    defaultValue: defaultSelectedTimeRange,
    onChange: onSelectedTimeRangeChange,
  });
  const [resolvedHoveredChannel, setHoveredChannel] = useControllableState({
    value: hoveredChannel,
    defaultValue: defaultHoveredChannel,
    onChange: onHoveredChannelChange,
  });

  const sampleCount = getMaxSampleCount(samples, channels);
  const duration = samplingFrequency > 0 ? sampleCount / samplingFrequency : 0;

  function setSyncedView(nextView: TimeseriesView) {
    viewRef.current = nextView;
    setView(nextView);
  }

  function setSyncedDrag(nextDrag: DragState | null) {
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  }

  useEffect(() => {
    const sampleCount = getMaxSampleCount(samples, channels);
    const nextDuration = samplingFrequency > 0 ? sampleCount / samplingFrequency : 0;
    const plotWidth = Math.max(1, canvasSize.width - PADDING.left - PADDING.right);

    if (nextDuration <= 0 || !Number.isFinite(nextDuration)) {
      return;
    }

    const nextView = mergeViewPreserveVisibleWindow(
      viewRef.current,
      viewSnapshotRef.current,
      samples,
      channels,
      nextDuration,
      plotWidth,
    );
    setSyncedView(nextView);
    viewSnapshotRef.current = { duration: nextDuration, plotWidth };
  }, [canvasSize.height, canvasSize.width, channels, samples, samplingFrequency]);

  useEffect(() => {
    if (previousResetViewSignalRef.current === resetViewSignal) {
      return;
    }

    previousResetViewSignalRef.current = resetViewSignal;
    const nextView = createInitialView(samples, channels);
    setSyncedView(nextView);
    const sampleCount = getMaxSampleCount(samples, channels);
    const duration = samplingFrequency > 0 ? sampleCount / samplingFrequency : 0;
    const plotWidth = Math.max(1, canvasSize.width - PADDING.left - PADDING.right);
    if (duration > 0) {
      viewSnapshotRef.current = { duration, plotWidth };
    }
    onResetView?.();
  }, [canvasSize.height, canvasSize.width, channels, onResetView, resetViewSignal, samples, samplingFrequency]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      setCanvasSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    renderTimeseries({
      canvas,
      samples,
      channels,
      samplingFrequency,
      view,
      selectedTimeRange: resolvedSelectedTimeRange,
      hoveredChannel: resolvedHoveredChannel,
      drag,
      windowSizeSeconds,
      windowAnnotationRows,
    });
  }, [
    canvasSize,
    channels,
    drag,
    resolvedHoveredChannel,
    resolvedSelectedTimeRange,
    samples,
    samplingFrequency,
    view,
    windowAnnotationRows,
    windowSizeSeconds,
  ]);

  const geometry = useMemo<PlotGeometry>(
    () => createPlotGeometry(canvasSize.width, canvasSize.height, getAnnotationRowCount(windowAnnotationRows)),
    [canvasSize, windowAnnotationRows],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!duration || event.button === 1) {
      return;
    }

    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event, canvas);
    const currentView = viewRef.current;

    if (event.button === 2) {
      setSyncedDrag({
        mode: "select",
        startX: point.x,
        startY: point.y,
        startOffset: currentView.xOffset,
        startTime: xToTime(point.x, geometry, currentView, duration),
        currentX: point.x,
      });
      return;
    }

    setSyncedDrag({
      mode: "pan",
      startX: point.x,
      startY: point.y,
      startOffset: currentView.xOffset,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    const activeDrag = dragRef.current;
    if (!activeDrag) {
      const nextHoveredChannel = getChannelAtPoint(point, geometry, channels);
      if (nextHoveredChannel !== resolvedHoveredChannel) {
        setHoveredChannel(nextHoveredChannel);
      }
      return;
    }

    if (activeDrag.mode === "pan") {
      const currentView = viewRef.current;
      const nextOffset = clampOffset(
        activeDrag.startOffset + point.x - activeDrag.startX,
        currentView.xScale,
        geometry.plotWidth,
      );
      setSyncedView({ ...currentView, xOffset: nextOffset });
      return;
    }

    setSyncedDrag({ ...activeDrag, currentX: point.x });
  };

  const handlePointerLeave = () => {
    if (!dragRef.current && resolvedHoveredChannel !== null) {
      setHoveredChannel(null);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const activeDrag = dragRef.current;
    if (!activeDrag) {
      return;
    }

    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (activeDrag.mode === "select" && activeDrag.startTime !== undefined && activeDrag.currentX !== undefined) {
      const endTime = xToTime(activeDrag.currentX, geometry, viewRef.current, duration);
      if (Math.abs(endTime - activeDrag.startTime) > 0.01) {
        setSelectedTimeRange({
          start: Math.max(0, Math.min(activeDrag.startTime, endTime)),
          end: Math.min(duration, Math.max(activeDrag.startTime, endTime)),
        });
      }
    }

    setSyncedDrag(null);
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    if (!duration) {
      return;
    }

    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;

    setView((current) => {
      const maxScale = Math.max(1, duration / 0.5);
      const nextScale = Math.max(1, Math.min(maxScale, current.xScale * zoomFactor));
      const currentVisibleDuration = duration / current.xScale;
      const currentStart = getVisibleStartTime(current, geometry.plotWidth, duration);
      const relativeX = Math.max(0, Math.min(geometry.plotWidth, point.x - PADDING.left));
      const anchorTime = currentStart + (relativeX / geometry.plotWidth) * currentVisibleDuration;
      const nextVisibleDuration = duration / nextScale;
      const nextStart = anchorTime - (relativeX / geometry.plotWidth) * nextVisibleDuration;
      const nextOffset = clampOffset((-nextStart / nextVisibleDuration) * geometry.plotWidth, nextScale, geometry.plotWidth);

      const nextView = {
        ...current,
        xScale: nextScale,
        xOffset: nextOffset,
      };
      viewRef.current = nextView;
      return nextView;
    });
  };

  return (
    <div className="eeg-timeseries">
      <canvas
        ref={canvasRef}
        className="eeg-timeseries-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
      />

      {isLoading ? <div className="eeg-timeseries-overlay">Loading signal...</div> : null}
      {error ? <div className="eeg-timeseries-overlay eeg-timeseries-overlay--error">{error}</div> : null}
      {!isLoading && !error && sampleCount === 0 && channels.length > 0 ? (
        <div className="eeg-timeseries-overlay">No signal selected</div>
      ) : null}
    </div>
  );
}

function renderTimeseries({
  canvas,
  samples,
  channels,
  samplingFrequency,
  view,
  selectedTimeRange,
  hoveredChannel,
  drag,
  windowSizeSeconds,
  windowAnnotationRows,
}: {
  canvas: HTMLCanvasElement;
  samples: Record<ChannelId, number[]>;
  channels: ChannelId[];
  samplingFrequency: number;
  view: TimeseriesView;
  selectedTimeRange: TimeRange | null;
  hoveredChannel: ChannelId | null;
  drag: DragState | null;
  windowSizeSeconds: number;
  windowAnnotationRows: TimeseriesWindowAnnotationRow[];
}) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);
  const pixelRatio = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.floor(width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(height * pixelRatio));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfd";
  ctx.fillRect(0, 0, width, height);

  const geometry = createPlotGeometry(width, height, getAnnotationRowCount(windowAnnotationRows));
  const sampleCount = getMaxSampleCount(samples, channels);
  const duration = samplingFrequency > 0 ? sampleCount / samplingFrequency : 0;
  if (!duration || sampleCount === 0) {
    drawEmptyAxes(ctx, geometry, windowAnnotationRows, windowSizeSeconds);
    return;
  }

  const visibleStartTime = getVisibleStartTime(view, geometry.plotWidth, duration);
  const visibleDuration = duration / view.xScale;
  const visibleEndTime = Math.min(duration, visibleStartTime + visibleDuration);
  const startIndex = Math.max(0, Math.floor(visibleStartTime * samplingFrequency));
  const endIndex = Math.min(sampleCount, Math.ceil(visibleEndTime * samplingFrequency));

  drawSelection(ctx, geometry, view, duration, selectedTimeRange, "rgb(14 116 144 / 18%)");
  if (drag?.mode === "select" && drag.startTime !== undefined && drag.currentX !== undefined) {
    drawDragSelection(ctx, geometry, view, duration, drag);
  }

  drawGridAndAxes(ctx, geometry, view, duration, visibleStartTime, visibleDuration);
  drawWindowAnnotationRows(ctx, geometry, view, duration, visibleStartTime, visibleDuration, {
    rows: windowAnnotationRows,
    windowSizeSeconds,
  });
  const hasHoveredChannel = hoveredChannel !== null && channels.includes(hoveredChannel);
  channels.forEach((channel, index) => {
    drawChannel(ctx, {
      values: samples[channel] ?? [],
      channelIndex: index,
      channelCount: channels.length,
      color: CHANNEL_COLORS[index % CHANNEL_COLORS.length] ?? "#0f6ea8",
      samplingFrequency,
      startIndex,
      endIndex,
      visibleStartTime,
      visibleDuration,
      geometry,
      view,
      isHighlighted: channel === hoveredChannel,
      hasHighlight: hasHoveredChannel,
    });
  });
}

function createPlotGeometry(width: number, height: number, annotationRowCount: number): PlotGeometry {
  const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
  const annotationHeight =
    annotationRowCount * WINDOW_ANNOTATION_ROW_HEIGHT +
    Math.max(0, annotationRowCount - 1) * WINDOW_ANNOTATION_ROW_GAP;
  const reservedBottom = X_AXIS_HEIGHT + WINDOW_ANNOTATION_TOP_GAP + annotationHeight + PADDING.bottom;
  const plotHeight = Math.max(48, height - PADDING.top - reservedBottom);
  const axisY = PADDING.top + plotHeight;
  const annotationTop = axisY + X_AXIS_HEIGHT + WINDOW_ANNOTATION_TOP_GAP;

  return {
    width,
    height,
    plotWidth,
    plotHeight,
    axisY,
    annotationTop,
    annotationBottom: annotationTop + annotationHeight,
  };
}

function getAnnotationRowCount(_windowAnnotationRows: TimeseriesWindowAnnotationRow[]): number {
  return WINDOW_ANNOTATION_ROW_COUNT;
}

function normalizeAnnotationRows(windowAnnotationRows: TimeseriesWindowAnnotationRow[]): TimeseriesWindowAnnotationRow[] {
  const rows = windowAnnotationRows.slice(0, WINDOW_ANNOTATION_ROW_COUNT);

  while (rows.length < WINDOW_ANNOTATION_ROW_COUNT) {
    rows.push(DEFAULT_WINDOW_ANNOTATION_ROWS[rows.length] ?? { id: `annotation-row-${rows.length + 1}` });
  }

  return rows;
}

function drawWindowAnnotationRows(
  ctx: CanvasRenderingContext2D,
  geometry: PlotGeometry,
  view: TimeseriesView,
  duration: number,
  visibleStartTime: number,
  visibleDuration: number,
  {
    rows,
    windowSizeSeconds,
  }: {
    rows: TimeseriesWindowAnnotationRow[];
    windowSizeSeconds: number;
  },
) {
  const normalizedRows = normalizeAnnotationRows(rows);
  const rowHeight = WINDOW_ANNOTATION_ROW_HEIGHT;
  const safeWindowSizeSeconds = Math.max(0.1, windowSizeSeconds);

  ctx.save();
  ctx.beginPath();
  ctx.rect(PADDING.left, geometry.annotationTop, geometry.plotWidth, geometry.annotationBottom - geometry.annotationTop);
  ctx.clip();

  normalizedRows.forEach((row, rowIndex) => {
    const rowTop = geometry.annotationTop + rowIndex * (rowHeight + WINDOW_ANNOTATION_ROW_GAP);
    ctx.fillStyle = "#eef3f6";
    ctx.fillRect(PADDING.left, rowTop, geometry.plotWidth, rowHeight);

    if (duration <= 0 || visibleDuration <= 0) {
      return;
    }

    const firstWindowIndex = Math.max(0, Math.floor(visibleStartTime / safeWindowSizeSeconds));
    const lastWindowIndex = Math.ceil(Math.min(duration, visibleStartTime + visibleDuration) / safeWindowSizeSeconds);

    for (let windowIndex = firstWindowIndex; windowIndex <= lastWindowIndex; windowIndex += 1) {
      const startTime = windowIndex * safeWindowSizeSeconds;
      const endTime = Math.min(duration, startTime + safeWindowSizeSeconds);
      if (endTime <= visibleStartTime || startTime >= visibleStartTime + visibleDuration) {
        continue;
      }

      const x1 = timeToX(startTime, geometry, view, duration);
      const x2 = timeToX(endTime, geometry, view, duration);
      const left = Math.max(PADDING.left, Math.min(x1, x2));
      const right = Math.min(geometry.width - PADDING.right, Math.max(x1, x2));
      if (right <= left) {
        continue;
      }

      const value = row.values?.[windowIndex] ?? null;
      const fillStyle = row.colors?.[windowIndex] ?? row.defaultColor ?? getDefaultAnnotationColor(rowIndex, windowIndex);
      ctx.fillStyle = fillStyle;
      ctx.fillRect(left + 0.5, rowTop, Math.max(1, right - left - 1), rowHeight);

      if (value !== null && right - left > 30) {
        ctx.fillStyle = "#17212b";
        ctx.font = "10px Inter, Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(value), left + (right - left) / 2, rowTop + rowHeight / 2);
      }
    }
  });

  ctx.restore();

  ctx.strokeStyle = "#d7e0e8";
  ctx.lineWidth = 1;
  normalizedRows.forEach((_row, rowIndex) => {
    const rowTop = geometry.annotationTop + rowIndex * (rowHeight + WINDOW_ANNOTATION_ROW_GAP);
    ctx.strokeRect(PADDING.left, rowTop, geometry.plotWidth, rowHeight);
  });

  ctx.fillStyle = "#334155";
  ctx.font = "11px Inter, Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  normalizedRows.forEach((row, rowIndex) => {
    if (!row.label) {
      return;
    }

    const rowTop = geometry.annotationTop + rowIndex * (rowHeight + WINDOW_ANNOTATION_ROW_GAP);
    ctx.fillText(row.label, PADDING.left - 10, rowTop + rowHeight / 2);
  });
}

function getDefaultAnnotationColor(rowIndex: number, windowIndex: number): string {
  const palette = [
    ["rgb(14 116 144 / 16%)", "rgb(14 116 144 / 10%)"],
    ["rgb(21 128 61 / 16%)", "rgb(21 128 61 / 10%)"],
    ["rgb(190 24 93 / 14%)", "rgb(190 24 93 / 9%)"],
  ];
  const rowPalette = palette[rowIndex] ?? palette[0];
  return rowPalette[windowIndex % rowPalette.length] ?? "rgb(23 33 43 / 8%)";
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  {
    values,
    channelIndex,
    channelCount,
    color,
    samplingFrequency,
    startIndex,
    endIndex,
    visibleStartTime,
    visibleDuration,
    geometry,
    view,
    isHighlighted,
    hasHighlight,
  }: {
    values: number[];
    channelIndex: number;
    channelCount: number;
    color: string;
    samplingFrequency: number;
    startIndex: number;
    endIndex: number;
    visibleStartTime: number;
    visibleDuration: number;
    geometry: PlotGeometry;
    view: TimeseriesView;
    isHighlighted: boolean;
    hasHighlight: boolean;
  },
) {
  if (endIndex <= startIndex || values.length === 0) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(PADDING.left, PADDING.top, geometry.plotWidth, geometry.plotHeight);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();

  const samplesPerPixel = (endIndex - startIndex) / geometry.plotWidth;
  const channelTop = PADDING.top + (geometry.plotHeight * channelIndex) / channelCount;
  const channelHeight = geometry.plotHeight / channelCount;

  if (isHighlighted) {
    ctx.fillStyle = "rgb(14 116 144 / 10%)";
    ctx.fillRect(PADDING.left, channelTop, geometry.plotWidth, channelHeight);
  }

  if (samplesPerPixel <= 1) {
    for (let index = startIndex; index < endIndex && index < values.length; index += 1) {
      const time = index / samplingFrequency;
      const x = PADDING.left + ((time - visibleStartTime) / visibleDuration) * geometry.plotWidth;
      const value = values[index];
      if (value === undefined) {
        continue;
      }

      const y = valueToY(value, view, channelTop, channelHeight);
      if (index === startIndex) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  } else {
    let hasStarted = false;
    for (let px = 0; px < geometry.plotWidth; px += 1) {
      const t0 = visibleStartTime + (px / geometry.plotWidth) * visibleDuration;
      const t1 = visibleStartTime + ((px + 1) / geometry.plotWidth) * visibleDuration;
      const i0 = Math.max(startIndex, Math.floor(t0 * samplingFrequency));
      const i1 = Math.min(endIndex, Math.ceil(t1 * samplingFrequency), values.length);
      if (i0 >= i1) {
        continue;
      }

      const firstValue = values[i0];
      if (firstValue === undefined) {
        continue;
      }

      let min = firstValue;
      let max = firstValue;
      for (let index = i0 + 1; index < i1; index += 1) {
        const value = values[index];
        if (value === undefined) {
          continue;
        }

        min = Math.min(min, value);
        max = Math.max(max, value);
      }

      const x = PADDING.left + px;
      const yMin = valueToY(min, view, channelTop, channelHeight);
      const yMax = valueToY(max, view, channelTop, channelHeight);
      if (!hasStarted) {
        ctx.moveTo(x, yMax);
        hasStarted = true;
      } else {
        ctx.lineTo(x, yMax);
      }
      if (Math.abs(yMax - yMin) > 0.5) {
        ctx.lineTo(x, yMin);
      }
    }
  }

  ctx.globalAlpha = hasHighlight && !isHighlighted ? 0.32 : 1;
  ctx.lineWidth = isHighlighted ? 2 : 1;
  ctx.stroke();
  ctx.restore();
}

function drawGridAndAxes(
  ctx: CanvasRenderingContext2D,
  geometry: PlotGeometry,
  view: TimeseriesView,
  duration: number,
  visibleStartTime: number,
  visibleDuration: number,
) {
  ctx.strokeStyle = "#d7e0e8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING.left, PADDING.top);
  ctx.lineTo(PADDING.left, geometry.annotationBottom);
  ctx.moveTo(PADDING.left, geometry.axisY);
  ctx.lineTo(geometry.width - PADDING.right, geometry.axisY);
  ctx.stroke();

  ctx.font = "10px Inter, Segoe UI, sans-serif";
  ctx.fillStyle = "#5d6b78";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const yTicks = 4;
  for (let tick = 0; tick <= yTicks; tick += 1) {
    const value = view.yMin + ((view.yMax - view.yMin) * tick) / yTicks;
    const y = PADDING.top + geometry.plotHeight - (geometry.plotHeight * tick) / yTicks;
    ctx.strokeStyle = tick === 0 ? "#d7e0e8" : "#e8eef3";
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(geometry.width - PADDING.right, y);
    ctx.stroke();
    ctx.fillText(value.toFixed(0), PADDING.left - 8, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xTicks = 6;
  for (let tick = 0; tick <= xTicks; tick += 1) {
    const x = PADDING.left + (geometry.plotWidth * tick) / xTicks;
    const time = Math.min(duration, visibleStartTime + (visibleDuration * tick) / xTicks);
    ctx.strokeStyle = "#e8eef3";
    ctx.beginPath();
    ctx.moveTo(x, PADDING.top);
    ctx.lineTo(x, geometry.annotationBottom);
    ctx.stroke();
    ctx.fillStyle = "#5d6b78";
    ctx.fillText(`${time.toFixed(1)}s`, x, geometry.axisY + 8);
  }
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  geometry: PlotGeometry,
  view: TimeseriesView,
  duration: number,
  selectedTimeRange: TimeRange | null,
  fillStyle: string,
) {
  if (!selectedTimeRange) {
    return;
  }

  const x1 = timeToX(selectedTimeRange.start, geometry, view, duration);
  const x2 = timeToX(selectedTimeRange.end, geometry, view, duration);
  const left = Math.max(PADDING.left, Math.min(x1, x2));
  const right = Math.min(geometry.width - PADDING.right, Math.max(x1, x2));
  if (right <= left) {
    return;
  }

  ctx.fillStyle = fillStyle;
  ctx.fillRect(left, PADDING.top, right - left, geometry.annotationBottom - PADDING.top);
}

function drawDragSelection(
  ctx: CanvasRenderingContext2D,
  geometry: PlotGeometry,
  view: TimeseriesView,
  duration: number,
  drag: DragState,
) {
  const startX = timeToX(drag.startTime ?? 0, geometry, view, duration);
  const currentX = Math.max(PADDING.left, Math.min(geometry.width - PADDING.right, drag.currentX ?? startX));
  const left = Math.min(startX, currentX);
  const right = Math.max(startX, currentX);
  ctx.fillStyle = "rgb(14 116 144 / 18%)";
  ctx.fillRect(left, PADDING.top, right - left, geometry.annotationBottom - PADDING.top);
}

function drawEmptyAxes(
  ctx: CanvasRenderingContext2D,
  geometry: PlotGeometry,
  windowAnnotationRows: TimeseriesWindowAnnotationRow[],
  windowSizeSeconds: number,
) {
  ctx.strokeStyle = "#d7e0e8";
  ctx.beginPath();
  ctx.moveTo(PADDING.left, PADDING.top);
  ctx.lineTo(PADDING.left, geometry.annotationBottom);
  ctx.moveTo(PADDING.left, geometry.axisY);
  ctx.lineTo(geometry.width - PADDING.right, geometry.axisY);
  ctx.stroke();
  drawWindowAnnotationRows(ctx, geometry, { xScale: 1, xOffset: 0, yMin: -1, yMax: 1 }, 0, 0, 0, {
    rows: windowAnnotationRows,
    windowSizeSeconds,
  });
}

function createInitialView(samples: Record<ChannelId, number[]>, channels: ChannelId[]): TimeseriesView {
  const values = channels.flatMap((channel) => samples[channel] ?? []);
  if (values.length === 0) {
    return { xScale: 1, xOffset: 0, yMin: -1, yMax: 1 };
  }

  const firstValue = values[0];
  if (firstValue === undefined) {
    return { xScale: 1, xOffset: 0, yMin: -1, yMax: 1 };
  }

  let min = firstValue;
  let max = firstValue;
  values.forEach((value) => {
    min = Math.min(min, value);
    max = Math.max(max, value);
  });
  const padding = (max - min) * 0.1 || 1;

  return {
    xScale: 1,
    xOffset: 0,
    yMin: min - padding,
    yMax: max + padding,
  };
}

function getMaxSampleCount(samples: Record<ChannelId, number[]>, channels: ChannelId[]): number {
  return channels.reduce((max, channel) => Math.max(max, samples[channel]?.length ?? 0), 0);
}

function valueToY(value: number, view: TimeseriesView, channelTop: number, channelHeight: number): number {
  const range = view.yMax - view.yMin || 1;
  const normalized = (value - view.yMin) / range;
  return channelTop + channelHeight - normalized * channelHeight;
}

function getVisibleStartTime(view: TimeseriesView, plotWidth: number, duration: number): number {
  const visibleDuration = duration / view.xScale;
  const clampedOffset = clampOffset(view.xOffset, view.xScale, plotWidth);
  return Math.max(0, (-clampedOffset / plotWidth) * visibleDuration);
}

function timeToX(time: number, geometry: PlotGeometry, view: TimeseriesView, duration: number): number {
  const visibleDuration = duration / view.xScale;
  const startTime = getVisibleStartTime(view, geometry.plotWidth, duration);
  return PADDING.left + ((time - startTime) / visibleDuration) * geometry.plotWidth;
}

function xToTime(x: number, geometry: PlotGeometry, view: TimeseriesView, duration: number): number {
  const visibleDuration = duration / view.xScale;
  const startTime = getVisibleStartTime(view, geometry.plotWidth, duration);
  const relativeX = Math.max(0, Math.min(geometry.plotWidth, x - PADDING.left));
  return startTime + (relativeX / geometry.plotWidth) * visibleDuration;
}

function clampOffset(offset: number, scale: number, plotWidth: number): number {
  const minOffset = -plotWidth * (scale - 1);
  return Math.max(minOffset, Math.min(0, offset));
}

function mergeViewPreserveVisibleWindow(
  currentView: TimeseriesView,
  previousSnapshot: { duration: number; plotWidth: number } | null,
  samples: Record<ChannelId, number[]>,
  channels: ChannelId[],
  nextDuration: number,
  plotWidth: number,
): TimeseriesView {
  const yView = createInitialView(samples, channels);
  const safePlotWidth = Math.max(1, plotWidth);

  if (nextDuration <= 0 || !Number.isFinite(nextDuration)) {
    return currentView;
  }

  if (!previousSnapshot || previousSnapshot.duration <= 0) {
    return yView;
  }

  const { duration: prevDuration, plotWidth: prevPlotWidth } = previousSnapshot;
  const decodeWidth = Math.max(1, prevPlotWidth);

  const maxScale = Math.max(1, nextDuration / 0.5);
  const xScale = Math.min(currentView.xScale, maxScale);
  const visibleDurationSec = nextDuration / xScale;
  if (visibleDurationSec <= 0 || !Number.isFinite(visibleDurationSec)) {
    return { ...yView, xScale: 1, xOffset: 0 };
  }

  const startTimeSec = getVisibleStartTime(currentView, decodeWidth, prevDuration);
  const maxStart = Math.max(0, nextDuration - visibleDurationSec);
  const clampedStart = Math.min(Math.max(0, startTimeSec), maxStart);
  const newOffset = clampOffset(
    -(clampedStart / visibleDurationSec) * safePlotWidth,
    xScale,
    safePlotWidth,
  );

  return {
    xScale,
    xOffset: newOffset,
    yMin: yView.yMin,
    yMax: yView.yMax,
  };
}

function getCanvasPoint(
  event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function getChannelAtPoint(
  point: { x: number; y: number },
  geometry: PlotGeometry,
  channels: ChannelId[],
): ChannelId | null {
  if (
    channels.length === 0 ||
    point.x < PADDING.left ||
    point.x > geometry.width - PADDING.right ||
    point.y < PADDING.top ||
    point.y > PADDING.top + geometry.plotHeight
  ) {
    return null;
  }

  const channelHeight = geometry.plotHeight / channels.length;
  const channelIndex = Math.floor((point.y - PADDING.top) / channelHeight);
  return channels[channelIndex] ?? null;
}
