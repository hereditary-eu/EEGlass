import { useEffect, useRef } from "react";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { resizeVegaView, useVegaLayoutResize } from "../../utils/vegaLayout";

export interface BandClassMatrixCell {
  [key: string]: string | number | boolean | null | undefined;
  classLabel: string;
  classShort: string;
  classOrder: number;
  band: string;
  bandOrder: number;
  value: number;
  valueText: string;
  cellColor: string;
  isHighlighted?: boolean;
  tooltipValue: string;
}

export interface BandClassMatrixProps {
  cells: BandClassMatrixCell[];
  className?: string;
  rowHeight?: number;
  minHeight?: number;
  topPadding?: number;
  showClassAxis?: boolean;
  tooltip: Array<Record<string, unknown>>;
}

export function BandClassMatrix({
  cells,
  className,
  rowHeight = 76,
  minHeight = 120,
  topPadding = 31,
  showClassAxis = true,
  tooltip,
}: BandClassMatrixProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  useVegaLayoutResize(viewRef);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!cells.length) {
      viewRef.current = null;
      return;
    }

    const xDomain = getOrderedDomain(cells, "band", "bandOrder");
    const yDomain = getOrderedDomain(cells, "classShort", "classOrder");
    const chartHeight = Math.max(minHeight, yDomain.length * rowHeight);
    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: "container",
      height: chartHeight,
      padding: { left: 0, right: 0, top: topPadding, bottom: 0 },
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { values: cells },
      layer: [
        {
          mark: { type: "rect" },
          encoding: {
            x: createBandXEncoding(xDomain),
            y: createClassYEncoding(yDomain, showClassAxis),
            color: { field: "cellColor", type: "nominal", scale: null, legend: null },
            stroke: {
              condition: { test: "datum.isHighlighted", value: "#0f5f76" },
              value: "#d7e0e8",
            },
            strokeWidth: {
              condition: { test: "datum.isHighlighted", value: 3 },
              value: 1,
            },
            tooltip,
          },
        },
        {
          mark: {
            type: "text",
            fontSize: 10,
            fontWeight: 800,
            color: "#17212b",
          },
          encoding: {
            x: createBandXEncoding(xDomain),
            y: createClassYEncoding(yDomain, showClassAxis),
            text: { field: "valueText", type: "nominal" },
            tooltip,
          },
        },
      ],
      config: {
        axis: {
          domain: false,
          grid: false,
          ticks: false,
          labelColor: "#334155",
          labelFont: "Helvetica Neue, Helvetica, Arial, sans-serif",
          labelFontSize: 10,
          labelFontWeight: 800,
          title: null,
        },
        view: { stroke: "#d7e0e8" },
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
        if (!finalized) {
          viewRef.current = result.view;
          resizeVegaView(result.view);
        }
      })
      .catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      viewRef.current = null;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [cells, minHeight, rowHeight, showClassAxis, tooltip, topPadding]);

  return <div className={className} ref={containerRef} />;
}

export function getBandClassDivergingColor(value: number, maxAbsValue: number): string {
  const normalized = normalizeBandClassValue(value, maxAbsValue);
  if (normalized < 0) {
    const strength = Math.abs(normalized);
    const red = Math.round(235 + (14 - 235) * strength);
    const green = Math.round(245 + (116 - 245) * strength);
    const blue = Math.round(248 + (144 - 248) * strength);
    return `rgb(${red} ${green} ${blue})`;
  }

  const red = Math.round(241 + (225 - 241) * normalized);
  const green = Math.round(245 + (29 - 245) * normalized);
  const blue = Math.round(249 + (72 - 249) * normalized);
  return `rgb(${red} ${green} ${blue})`;
}

export function normalizeBandClassValue(value: number, maxAbsValue: number): number {
  return Math.max(-1, Math.min(1, value / maxAbsValue));
}

export function formatBandClassValue(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function createBandXEncoding(domain: string[]) {
  return {
    field: "band",
    type: "nominal" as const,
    sort: domain,
    axis: { orient: "top" as const, labelAngle: 0 },
    scale: { domain, paddingInner: 0, paddingOuter: 0 },
  };
}

function createClassYEncoding(domain: string[], showAxis: boolean) {
  return {
    field: "classShort",
    type: "nominal" as const,
    sort: domain,
    axis: showAxis ? { labelLimit: 78 } : null,
    scale: { domain, paddingInner: 0, paddingOuter: 0 },
  };
}

function getOrderedDomain(
  cells: BandClassMatrixCell[],
  labelField: "band" | "classShort",
  orderField: "bandOrder" | "classOrder",
) {
  return Array.from(
    new Map(
      [...cells]
        .sort((a, b) => Number(a[orderField]) - Number(b[orderField]))
        .map((cell) => [String(cell[labelField]), String(cell[labelField])]),
    ).values(),
  );
}
