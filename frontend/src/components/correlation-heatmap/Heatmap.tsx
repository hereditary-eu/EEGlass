import { useEffect, useRef, useState } from "react";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { resizeVegaView, useVegaLayoutResize } from "../../utils/vegaLayout";

export type CorrelationHeatmapDatum = Record<string, string | number | boolean | null | undefined>;

const DEFAULT_HEATMAP_HEIGHT = 260;
const MIN_HEATMAP_HEIGHT = 120;

interface CorrelationCell {
  a: string;
  b: string;
  correlation: number;
  correlationText: string;
  isSelected: boolean;
  textColor: string;
}

interface NeuroHeatmapPlotProps {
  patientsData: CorrelationHeatmapDatum[];
  covariateFeatures: string[];
  selectedFeatures: [string, string];
  onSelectedFeaturesChange: (selectedFeatures: [string, string]) => void;
}

export function NeuroHeatmapPlot({
  patientsData,
  covariateFeatures,
  selectedFeatures,
  onSelectedFeaturesChange,
}: NeuroHeatmapPlotProps) {
  const heatmapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const [plotHeight, setPlotHeight] = useState(DEFAULT_HEATMAP_HEIGHT);
  useVegaLayoutResize(viewRef);

  useEffect(() => {
    const container = heatmapRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const nextHeight = Math.max(MIN_HEATMAP_HEIGHT, Math.floor(entry.contentRect.height));
      setPlotHeight((current) => (current !== nextHeight ? nextHeight : current));
      resizeVegaView(viewRef.current);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const container = heatmapRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    const correlations: CorrelationCell[] = covariateFeatures.flatMap((a) =>
      covariateFeatures.map((b) => {
        const correlation = correlationForFeaturePair(patientsData, a, b);
        const isSelected = a === selectedFeatures[0] && b === selectedFeatures[1];
        return {
          a,
          b,
          correlation,
          correlationText: correlation.toFixed(2),
          isSelected,
          textColor: correlation > 0.8 || correlation < -0.6 ? "white" : "black",
        };
      }),
    );

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
      data: { values: correlations },
      resolve: {
        scale: {
          color: "independent",
        },
      },
      encoding: {
        x: createFeatureAxis("a", covariateFeatures, -45),
        y: createFeatureAxis("b", covariateFeatures, 0),
      },
      layer: [
        {
          mark: {
            type: "rect",
            cursor: "pointer",
            stroke: "transparent",
          },
          encoding: {
            color: {
              field: "correlation",
              type: "quantitative",
              title: "correlation",
              scale: {
                domain: [-1, 0, 1],
                range: ["#5e4fa2", "#ffffbf", "#9e0142"],
              },
              legend: {
                orient: "right",
                gradientLength: 160,
                gradientThickness: 14,
                titleColor: "#5d6b78",
                labelColor: "#5d6b78",
                titleFontSize: 10,
                labelFontSize: 10,
              },
            },
            opacity: {
              condition: { test: "datum.isSelected", value: 0.5 },
              value: 1,
            },
            strokeWidth: {
              condition: { test: "datum.isSelected", value: 2.5 },
              value: 0,
            },
          },
        },
        {
          mark: {
            type: "text",
            fontSize: 10,
            cursor: "pointer",
          },
          encoding: {
            text: { field: "correlationText" },
            color: { field: "textColor", type: "nominal", scale: null, legend: null },
          },
        },
      ],
      config: {
        view: {
          strokeWidth: 0,
        },
        axis: {
          domain: false,
          labelColor: "#5d6b78",
          labelFontSize: 9,
          titleColor: "#5d6b78",
          titleFontSize: 10,
          tickColor: "#d7e0e8",
        },
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
        result.view.addEventListener("click", (_event, item) => {
          const datum = item?.datum as Partial<CorrelationCell> | undefined;
          if (typeof datum?.a === "string" && typeof datum.b === "string") {
            onSelectedFeaturesChange([datum.a, datum.b]);
          }
        });
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
  }, [patientsData, covariateFeatures, onSelectedFeaturesChange, plotHeight, selectedFeatures]);

  return <div className="correlation-heatmap-plot" ref={heatmapRef} />;
}

function correlationForFeaturePair(rows: CorrelationHeatmapDatum[], first: string, second: string): number {
  if (first === second) {
    return 1;
  }

  const pairedValues = rows.flatMap((row) => {
    const firstValue = row[first];
    const secondValue = row[second];
    return typeof firstValue === "number" &&
      Number.isFinite(firstValue) &&
      typeof secondValue === "number" &&
      Number.isFinite(secondValue)
      ? [{ firstValue, secondValue }]
      : [];
  });
  const correlation = pearsonCorrelation(
    pairedValues.map((pair) => pair.firstValue),
    pairedValues.map((pair) => pair.secondValue),
  );
  return Number.isFinite(correlation) ? correlation : 0;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) {
    return Number.NaN;
  }

  const xMean = mean(x);
  const yMean = mean(y);
  const covariance = x.reduce((sum, value, index) => sum + (value - xMean) * (y[index]! - yMean), 0);
  const sigmaX = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const sigmaY = y.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const denominator = Math.sqrt(sigmaX * sigmaY);
  return denominator === 0 ? Number.NaN : covariance / denominator;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createFeatureAxis(field: "a" | "b", domain: string[], labelAngle: number) {
  return {
    field,
    type: "nominal" as const,
    sort: domain,
    axis: {
      labelAngle,
      tickSize: 0,
      title: null,
    },
  };
}
