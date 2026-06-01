import { useEffect, useRef, useState } from "react";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { resizeVegaView, useVegaLayoutResize } from "../../utils/vegaLayout";

export interface EmbeddingPairwiseScatterplotPoint {
  id: string;
  x: number;
  y: number;
  predictedClass: string;
}

interface EmbeddingPairwiseScatterplotProps {
  points: EmbeddingPairwiseScatterplotPoint[];
  xLabel: string;
  yLabel: string;
}

export function EmbeddingPairwiseScatterplot({ points, xLabel, yLabel }: EmbeddingPairwiseScatterplotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const [plotHeight, setPlotHeight] = useState(420);
  useVegaLayoutResize(viewRef);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const nextHeight = Math.max(320, Math.floor(entry.contentRect.height));
      setPlotHeight((current) => (current !== nextHeight ? nextHeight : current));
      resizeVegaView(viewRef.current);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!points.length || plotHeight <= 0) {
      viewRef.current = null;
      return;
    }

    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: "container",
      height: plotHeight,
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { values: points },
      mark: {
        type: "circle",
        filled: true,
      },
      encoding: {
        x: {
          field: "x",
          type: "quantitative",
          axis: createAxis(xLabel),
        },
        y: {
          field: "y",
          type: "quantitative",
          axis: createAxis(yLabel),
        },
        color: {
          field: "predictedClass",
          type: "nominal",
          title: "Predicted class",
          scale: { scheme: "category10" },
          legend: {
            orient: "bottom",
            titleColor: "#5d6b78",
            labelColor: "#5d6b78",
            titleFontSize: 11,
            labelFontSize: 11,
          },
        },
        size: { value: 58 },
        opacity: { value: 0.78 },
        stroke: { value: "#ffffff" },
        strokeWidth: { value: 0.8 },
        tooltip: [
          { field: "id", type: "nominal", title: "Item" },
          { field: "predictedClass", type: "nominal", title: "Predicted class" },
          { field: "x", type: "quantitative", title: xLabel, format: ".4f" },
          { field: "y", type: "quantitative", title: yLabel, format: ".4f" },
        ],
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
        if (finalized) {
          return;
        }

        viewRef.current = result.view;
        resizeVegaView(result.view);
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
  }, [plotHeight, points, xLabel, yLabel]);

  return <div className="embedding-pairwise-scatterplot" ref={containerRef} />;
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
