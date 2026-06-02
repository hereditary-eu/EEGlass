import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import "./Histogram.css";

interface HistogramProps {
  data: number[];
  variant?: "tiny" | "big";
  width?: number;
  height?: number;
  initialBins?: number;
  showControls?: boolean;
  showAxes?: boolean;
  showTooltip?: boolean;
  showGrid?: boolean;
  barColor?: string;
  animated?: boolean;
  title?: string;
}

const rootClass = "cif-histogram";
const styles = {
  wrapper: "wrapper",
  chart: "chart",
  title: "title",
  controls: "controls",
  binSelect: "binSelect",
} as const;

interface HistogramDatum {
  bin: string;
  fullLabel: string;
  count: number;
  order: number;
}

const Histogram: React.FC<HistogramProps> = ({
  data,
  variant = "big",
  width = variant === "tiny" ? 100 : undefined,
  height = variant === "tiny" ? 30 : 300,
  initialBins = 10,
  showControls = variant === "big",
  showAxes = variant === "big",
  showTooltip = variant === "big",
  showGrid = variant === "big",
  barColor = "#8884d8",
  animated: _animated = false,
  title,
}) => {
  const [bins, setBins] = useState(initialBins);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const binOptions = [2, 5, 10, 15, 20, 25, 30];

  const histogramData = useMemo<HistogramDatum[]>(() => {
    if (!data?.length) {
      return [];
    }

    const numericData = data.filter((value): value is number => Number.isFinite(value));

    if (numericData.length === 0) {
      return [];
    }

    const min = Math.min(...numericData);
    const max = Math.max(...numericData);
    const binWidth = max === min ? 1 : (max - min) / bins;

    const computedHistogramData = Array.from({ length: bins }, (_, index) => {
      const lowerBound = min + index * binWidth;
      const upperBound = min + (index + 1) * binWidth;

      let binLabel: string;
      if (max < 0.1) {
        binLabel = lowerBound.toExponential(1);
      } else if (max > 1000) {
        binLabel = `${Math.round(lowerBound)}`;
      } else {
        const decimals = max < 1 ? 3 : max < 10 ? 2 : max < 100 ? 1 : 0;
        binLabel = lowerBound.toFixed(decimals);
      }

      return {
        bin: binLabel,
        fullLabel: `${lowerBound.toFixed(3)} - ${upperBound.toFixed(3)}`,
        count: 0,
        order: index,
      };
    });

    numericData.forEach((value) => {
      const normalizedIndex = Math.floor((value - min) / binWidth);
      const binIndex = Math.min(Math.max(normalizedIndex, 0), bins - 1);

      const bin = computedHistogramData[binIndex];
      if (bin) {
        bin.count += 1;
      }
    });

    return computedHistogramData;
  }, [bins, data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!histogramData.length) {
      viewRef.current = null;
      return;
    }

    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: width ?? "container",
      height,
      padding: variant === "big" ? { top: 20, right: 30, bottom: 20, left: 20 } : 0,
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { values: histogramData },
      mark: {
        type: "bar" as const,
        color: barColor,
        cornerRadiusTopLeft: variant === "big" ? 2 : 0,
        cornerRadiusTopRight: variant === "big" ? 2 : 0,
      },
      encoding: {
        x: {
          field: "bin",
          type: "ordinal" as const,
          sort: { field: "order", order: "ascending" as const },
          axis: showAxes
            ? {
                title: null,
                labelAngle: -45,
                labelColor: "#5d6b78",
                labelFontSize: 10,
                tickColor: "#d7e0e8",
                domainColor: "#d7e0e8",
              }
            : null,
        },
        y: {
          field: "count",
          type: "quantitative" as const,
          axis: showAxes
            ? {
                title: null,
                labelColor: "#5d6b78",
                labelFontSize: 10,
                grid: showGrid,
                gridColor: "#e8eef3",
                domain: false,
                tickMinStep: 1,
              }
            : null,
          scale: { nice: true, zero: true },
        },
        tooltip: showTooltip
          ? [
              { field: "fullLabel", type: "nominal" as const, title: "Range" },
              { field: "count", type: "quantitative" as const, title: "Count" },
            ]
          : undefined,
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
        if (!finalized) {
          viewRef.current = result.view;
          void result.view.resize().runAsync().catch(() => undefined);
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
  }, [barColor, height, histogramData, showAxes, showGrid, showTooltip, variant, width]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || width) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      void viewRef.current?.resize().runAsync().catch(() => undefined);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [width]);

  if (histogramData.length === 0) {
    return null;
  }

  return (
    <div className={`${rootClass} ${styles.wrapper}`}>
      {title && (
        <div className={styles.title}>
          <strong>{title}</strong>
        </div>
      )}
      {showControls && (
        <div className={styles.controls}>
          <label>Bin Count: </label>
          <select value={bins} onChange={(event) => setBins(Number(event.target.value))} className={styles.binSelect}>
            {binOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )}
      <div
        className={styles.chart}
        ref={containerRef}
        style={{
          width: width ? `${width}px` : "100%",
          height: `${height}px`,
        }}
      />
    </div>
  );
};

export default memo(Histogram);
