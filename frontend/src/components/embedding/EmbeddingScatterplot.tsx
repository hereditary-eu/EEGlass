import { useEffect, useRef, useState } from "react";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

export interface EmbeddingScatterplotPoint {
  id: string;
  x: number;
  y: number;
  fillColor: string;
  strokeColor: string;
  pointSize: number;
  opacity: number;
  strokeWidth: number;
  [key: string]: string | number | null;
}

export interface EmbeddingScatterplotTooltipField {
  field: string;
  type: "nominal" | "quantitative";
  title: string;
  format?: string;
}

interface EmbeddingScatterplotProps {
  points: EmbeddingScatterplotPoint[];
  isLoading: boolean;
  error: string | null;
  emptyMessage: string;
  tooltipFields: EmbeddingScatterplotTooltipField[];
  className?: string;
  overlayClassName?: string;
  minHeight?: number;
  showStatusOverlay?: boolean;
  onPointClick?: (point: EmbeddingScatterplotPoint) => void;
  onSelectionChange?: (selectedPointIds: string[] | null) => void;
}

export function EmbeddingScatterplot({
  points,
  isLoading,
  error,
  emptyMessage,
  tooltipFields,
  className = "embedding-scatterplot",
  overlayClassName = "embedding-scatterplot-overlay",
  minHeight = 220,
  showStatusOverlay = true,
  onPointClick,
  onSelectionChange,
}: EmbeddingScatterplotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef(points);
  const onPointClickRef = useRef(onPointClick);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const [plotHeight, setPlotHeight] = useState(280);
  const hasPointClick = Boolean(onPointClick);
  const hasSelection = Boolean(onSelectionChange);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    onPointClickRef.current = onPointClick;
  }, [onPointClick]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextHeight = Math.max(minHeight, Math.floor(entry.contentRect.height));
      setPlotHeight((current) => (current !== nextHeight ? nextHeight : current));
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [minHeight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!points.length || (showStatusOverlay && isLoading) || (showStatusOverlay && error) || plotHeight <= 0) {
      return;
    }

    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      width: "container",
      height: plotHeight,
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { values: points },
      params: hasSelection
        ? [
            {
              name: "patientBrush",
              select: {
                type: "interval",
                encodings: ["x", "y"],
              },
            },
          ]
        : undefined,
      mark: {
        type: "circle",
        filled: true,
        cursor: hasPointClick ? "pointer" : "default",
      },
      encoding: {
        x: {
          field: "x",
          type: "quantitative",
          axis: createAxis("PC1"),
        },
        y: {
          field: "y",
          type: "quantitative",
          axis: createAxis("PC2"),
        },
        fill: { field: "fillColor", type: "nominal", scale: null, legend: null },
        stroke: { field: "strokeColor", type: "nominal", scale: null, legend: null },
        size: { field: "pointSize", type: "quantitative", scale: null, legend: null },
        opacity: { field: "opacity", type: "quantitative", scale: null, legend: null },
        strokeWidth: { field: "strokeWidth", type: "quantitative", scale: null, legend: null },
        tooltip: tooltipFields,
      },
      config: {
        view: { stroke: null },
      },
    };

    let finalized = false;
    const resultPromise = embed(container, spec, {
      actions: false,
      renderer: "svg",
    });

    resultPromise.catch(() => undefined);
    resultPromise
      .then((result) => {
        result.view.addEventListener("click", (_event, item) => {
          const datum = item?.datum as EmbeddingScatterplotPoint | undefined;
          if (datum) {
            onPointClickRef.current?.(datum);
          }
        });
        if (hasSelection) {
          result.view.addSignalListener("patientBrush", (_name, value) => {
            onSelectionChangeRef.current?.(getSelectedPointIds(pointsRef.current, value));
          });
        }
      })
      .catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [error, hasPointClick, hasSelection, isLoading, plotHeight, points, showStatusOverlay, tooltipFields]);

  return (
    <>
      <div className={className} ref={containerRef} />
      {showStatusOverlay && isLoading ? <div className={overlayClassName}>Loading embeddings...</div> : null}
      {showStatusOverlay && error ? (
        <div className={`${overlayClassName} ${overlayClassName}--error`}>{error}</div>
      ) : null}
      {!isLoading && !error && !points.length ? <div className={overlayClassName}>{emptyMessage}</div> : null}
    </>
  );
}

function getSelectedPointIds(points: EmbeddingScatterplotPoint[], signalValue: unknown): string[] | null {
  if (!isBrushSignal(signalValue)) {
    return null;
  }

  const [x0, x1] = normalizeExtent(signalValue.x);
  const [y0, y1] = normalizeExtent(signalValue.y);

  return points
    .filter((point) => point.x >= x0 && point.x <= x1 && point.y >= y0 && point.y <= y1)
    .map((point) => point.id);
}

function isBrushSignal(value: unknown): value is { x: [number, number]; y: [number, number] } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { x?: unknown; y?: unknown };
  return isNumericExtent(candidate.x) && isNumericExtent(candidate.y);
}

function isNumericExtent(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function normalizeExtent([start, end]: [number, number]): [number, number] {
  return start <= end ? [start, end] : [end, start];
}

function createAxis(title: string) {
  return {
    title,
    titleColor: "#5d6b78",
    titleFontSize: 11,
    labelColor: "#5d6b78",
    labelFontSize: 11,
    tickColor: "#d7e0e8",
    domainColor: "#d7e0e8",
    gridColor: "#e8eef3",
  };
}
