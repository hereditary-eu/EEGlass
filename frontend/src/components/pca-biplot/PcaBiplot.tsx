import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

import type { NeuroPatient } from "../../types/neuro";
import { calcMinMaxMatrix } from "../../utils/neurodegenvis/helperFunctions";
import { NEURO_CLUSTER_COLORS, NEURO_FONT_SIZE } from "../../utils/neurodegenvis/visVariables";

function getLoadingMarks(featureIndex: number, loadings: number[][], loadingScaleFactor: number, features: string[]) {
  const lineData = [
    { x: 0, y: 0 },
    {
      x: loadings[featureIndex][0] * loadingScaleFactor,
      y: loadings[featureIndex][1] * loadingScaleFactor,
      feature: features[featureIndex],
    },
  ];

  return {
    line: Plot.line(lineData, {
      x: "x",
      y: "y",
      stroke: "red",
      strokeWidth: 2,
      markerEnd: "arrow",
    }),
    text: Plot.text([lineData[1]], {
      x: "x",
      y: "y",
      text: "feature",
      dy: -10 * Math.sign(lineData[1].y || 1),
      fontSize: 13,
      fill: "white",
    }),
  };
}

interface NeuroPcaBiplotProps {
  patientsData: NeuroPatient[];
  numericFeatures: string[];
  loadings: number[][];
  biplotFeatures: string[];
  showKMeans: boolean;
}

export function NeuroPcaBiplot({
  patientsData,
  numericFeatures,
  loadings,
  biplotFeatures,
  showKMeans,
}: NeuroPcaBiplotProps) {
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const validPatients = patientsData.filter((patient) => patient.valid_pc);
    const projections = validPatients.map((patient) => [Number(patient.pc1), Number(patient.pc2)]);
    const validClusters = validPatients.map((patient) => Number(patient.k_mean_cluster));
    const [minX, , minY] = calcMinMaxMatrix({
      matrix: projections,
      feature1: 0,
      feature2: 1,
    });

    const loadingScaleFactor = 2.2;
    const selectedFeatureIndexes = biplotFeatures
      .map((feature) => numericFeatures.indexOf(feature))
      .filter((index) => index >= 0);
    const loadingMarks = selectedFeatureIndexes.flatMap((featureIndex) => {
      const marks = getLoadingMarks(featureIndex, loadings, loadingScaleFactor, numericFeatures);
      return [marks.line, marks.text];
    });

    const plot = Plot.plot({
      marginBottom: 40,
      marks: [
        Plot.dot(projections, {
          x: (datum) => datum[0],
          y: (datum) => datum[1],
          tip: true,
          title: (datum, index) =>
            `Patient ID: ${validPatients[index].record_id}\nCluster ${validClusters[index]}\nPC 1: ${datum[0].toFixed(2)}\nPC 2: ${datum[1].toFixed(2)}`,
          ...(showKMeans
            ? {
                stroke: (_, index) => NEURO_CLUSTER_COLORS[validClusters[index]],
              }
            : {}),
        }),
        Plot.ruleY([minY]),
        Plot.ruleX([minX]),
        Plot.ruleY([0]),
        Plot.ruleX([0]),
        ...loadingMarks,
      ],
      x: {
        label: "Principal Component 1",
      },
      y: {
        label: "Principal Component 2",
      },
      style: `--plot-background: black; font-size: ${NEURO_FONT_SIZE}`,
    });

    if (plotRef.current) {
      plotRef.current.innerHTML = "";
      plotRef.current.append(plot);
    }

    return () => {
      plot.remove();
    };
  }, [biplotFeatures, loadings, numericFeatures, patientsData, showKMeans]);

  return <div ref={plotRef} />;
}
