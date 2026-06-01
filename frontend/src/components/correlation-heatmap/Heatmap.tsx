import { useEffect, useRef } from "react";
import * as d3 from "d3";
import * as Plot from "@observablehq/plot";

import { pearsonCorrelation } from "../../utils/neurodegenvis/pearsonCorrelation";
import { NEURO_FONT_SIZE } from "../../utils/neurodegenvis/visVariables";

export type CorrelationHeatmapDatum = Record<string, string | number | boolean | null | undefined>;

interface CorrelationCell {
  a: string;
  b: string;
  correlation: number;
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

  useEffect(() => {
    const correlations: CorrelationCell[] = d3.cross(covariateFeatures, covariateFeatures).map(([a, b]) => ({
      a,
      b,
      correlation: pearsonCorrelation(
        (Plot.valueof(patientsData as object[], a) as number[] | null) ?? [],
        (Plot.valueof(patientsData as object[], b) as number[] | null) ?? [],
      ),
    }));

    const plot = Plot.plot({
      width: covariateFeatures.length * 65 + 165,
      height: covariateFeatures.length * 35 + 155,
      marginLeft: 134,
      marginBottom: 132,
      label: null,
      color: {
        scheme: "buylrd",
        pivot: 0,
        legend: true,
        label: "correlation",
      },
      x: {
        domain: covariateFeatures,
        tickRotate: 90,
      },
      y: {
        domain: covariateFeatures,
      },
      marks: [
        Plot.cell(correlations, {
          x: "a",
          y: "b",
          fill: "correlation",
          className: "heatmap-cell",
        }),
        Plot.text(correlations, {
          x: "a",
          y: "b",
          text: (datum) => datum.correlation.toFixed(2),
          fill: (datum) => (datum.correlation > 0.8 || datum.correlation < -0.6 ? "white" : "black"),
          fontSize: 12,
          className: "heatmap-label",
        }),
      ],
      style: `font-size: ${NEURO_FONT_SIZE}; --plot-axis-tick-rotate: 90deg;`,
    });

    d3.select(plot).selectAll(".heatmap-label").style("pointer-events", "none");

    const rects = d3.select(plot).selectAll<SVGRectElement, unknown>(".heatmap-cell rect");
    const applyHighlight = (pair: [string, string]) => {
      rects
        .style("fill-opacity", (_, index) => {
          const correlation = correlations[index];
          return correlation.a === pair[0] && correlation.b === pair[1] ? "0.5" : "1";
        })
        .style("stroke", "none")
        .style("stroke-width", 0);
    };

    applyHighlight(selectedFeatures);

    rects
      .on("click", function () {
        const index = rects.nodes().indexOf(this);
        if (index < 0) {
          return;
        }

        const correlation = correlations[index];
        onSelectedFeaturesChange([correlation.a, correlation.b]);
        applyHighlight([correlation.a, correlation.b]);
      })
      .on("pointerover", function () {
        d3.select(this).style("stroke", "black").style("stroke-width", 3.5);
      })
      .on("pointerout", function () {
        const rect = d3.select(this);
        const index = rects.nodes().indexOf(this);
        const correlation = index >= 0 ? correlations[index] : undefined;
        const isSelected =
          correlation !== undefined && correlation.a === selectedFeatures[0] && correlation.b === selectedFeatures[1];
        rect.style("stroke", isSelected ? "black" : "none").style("stroke-width", isSelected ? 2.5 : 0);
      });

    if (heatmapRef.current) {
      heatmapRef.current.innerHTML = "";
      heatmapRef.current.append(plot);
    }

    return () => {
      plot.remove();
    };
  }, [patientsData, covariateFeatures, onSelectedFeaturesChange, selectedFeatures]);

  return <div ref={heatmapRef} />;
}
