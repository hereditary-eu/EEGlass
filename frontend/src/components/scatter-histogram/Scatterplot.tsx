import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

import type { NeuroPatient } from "../../types/neuro";
import { calcMinMaxPatientsData } from "../../utils/neurodegenvis/helperFunctions";
import { averageLine, linearRegression } from "../../utils/neurodegenvis/scatterplotUtils";
import {
  NEURO_BINARY_COLORS,
  NEURO_BINARY_STRING_COLORS,
  NEURO_CLUSTER_COLORS,
  NEURO_DIAGNOSIS_COLORS,
  NEURO_FONT_SIZE,
} from "../../utils/neurodegenvis/visVariables";

interface NeuroScatterplotProps {
  yFeature: string;
  xFeature: string;
  patientsData: NeuroPatient[];
  categoricalFeature: string;
  kMeanClusters: number;
  showDashedLine?: boolean;
  showCategoryRegression?: boolean;
  showCategoryAverage?: boolean;
}

export function NeuroScatterplot({
  yFeature,
  xFeature,
  patientsData,
  categoricalFeature,
  kMeanClusters,
  showDashedLine = false,
  showCategoryAverage = false,
  showCategoryRegression = false,
}: NeuroScatterplotProps) {
  const scatterplotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const filteredPatients = patientsData.filter((patient) => {
      const xValue = Number(patient[xFeature]);
      const yValue = Number(patient[yFeature]);
      return !Number.isNaN(xValue) && !Number.isNaN(yValue);
    });

    let categorySelected = categoricalFeature !== "" && categoricalFeature !== "None";
    let categoryColors = NEURO_BINARY_COLORS;
    let usingClusterColor = false;
    let usingDiagnosisLegend = false;

    if (categoricalFeature === "k_mean_cluster") {
      if (kMeanClusters <= 1) {
        categorySelected = false;
      } else {
        usingClusterColor = true;
        categoryColors = NEURO_CLUSTER_COLORS;
      }
    }

    if (categoricalFeature === "z_diagnosis") {
      usingDiagnosisLegend = true;
    }

    const [minX, maxX, minY, maxY] = calcMinMaxPatientsData({
      yFeature,
      xFeature,
      patientsData: filteredPatients,
    });

    const xValues = filteredPatients.map((patient) => Number(patient[xFeature]));
    const yValues = filteredPatients.map((patient) => Number(patient[yFeature]));
    const [overallSlope, overallIntercept] = linearRegression(xValues, yValues);
    const lineX = [minX, maxX];
    const overallLine = lineX.map((value) => ({ x: value, y: overallSlope * value + overallIntercept }));

    const firstGroup = filteredPatients.filter((patient) => Number(patient[categoricalFeature]) === 0);
    const secondGroup = filteredPatients.filter((patient) => Number(patient[categoricalFeature]) === 1);

    const [firstSlope, firstIntercept] = showCategoryRegression
      ? linearRegression(
          firstGroup.map((patient) => Number(patient[xFeature])),
          firstGroup.map((patient) => Number(patient[yFeature])),
        )
      : averageLine(firstGroup.map((patient) => Number(patient[yFeature])));

    const [secondSlope, secondIntercept] = showCategoryRegression
      ? linearRegression(
          secondGroup.map((patient) => Number(patient[xFeature])),
          secondGroup.map((patient) => Number(patient[yFeature])),
        )
      : averageLine(secondGroup.map((patient) => Number(patient[yFeature])));

    const firstCategoryLine = lineX.map((value) => ({ x: value, y: firstSlope * value + firstIntercept }));
    const secondCategoryLine = lineX.map((value) => ({ x: value, y: secondSlope * value + secondIntercept }));

    const plot = Plot.plot({
      marginBottom: 35,
      marks: [
        Plot.dot(filteredPatients, {
          x: xFeature,
          y: yFeature,
          ...(categorySelected
            ? {
                ...(usingDiagnosisLegend
                  ? { stroke: (datum) => NEURO_DIAGNOSIS_COLORS[String(datum[categoricalFeature])] }
                  : { stroke: (datum) => categoryColors[Number(datum[categoricalFeature])] }),
              }
            : {}),
          tip: true,
          title: (datum) =>
            `Patient ID: ${datum.record_id}\n${xFeature}: ${Number(datum[xFeature]).toFixed(2)}\n${yFeature}: ${Number(datum[yFeature]).toFixed(2)}`,
        }),
        Plot.line(overallLine, {
          x: "x",
          y: "y",
          stroke: "white",
          strokeWidth: 1.8,
        }),
        ...(categorySelected && (showCategoryRegression || showCategoryAverage)
          ? [
              Plot.line(firstCategoryLine, {
                x: "x",
                y: "y",
                stroke: usingClusterColor ? NEURO_CLUSTER_COLORS[0] : categoryColors[0],
                strokeWidth: 3,
              }),
              Plot.line(secondCategoryLine, {
                x: "x",
                y: "y",
                stroke: usingClusterColor ? NEURO_CLUSTER_COLORS[1] : categoryColors[1],
                strokeWidth: 2.5,
              }),
            ]
          : []),
        Plot.crosshair(filteredPatients, {
          x: xFeature,
          y: yFeature,
          tip: true,
        }),
        Plot.ruleY([minY]),
        Plot.ruleX([minX]),
        ...(showDashedLine ? [Plot.ruleY([-1], { strokeDasharray: "3" })] : []),
      ],
      x: {
        label: xFeature,
        domain: [minX, maxX],
      },
      y: {
        label: yFeature,
        domain: [minY, maxY],
      },
      color: {
        type: "identity",
        ...(categorySelected && !usingDiagnosisLegend && !usingClusterColor
          ? {
              legend: false,
            }
          : {}),
        ...(usingDiagnosisLegend
          ? {
              legend: false,
            }
          : {}),
      },
      style: `--plot-background: black; font-size: ${NEURO_FONT_SIZE}`,
    });

    if (scatterplotRef.current) {
      scatterplotRef.current.innerHTML = "";
      scatterplotRef.current.append(plot);
    }

    return () => {
      plot.remove();
    };
  }, [
    categoricalFeature,
    kMeanClusters,
    patientsData,
    showCategoryAverage,
    showCategoryRegression,
    showDashedLine,
    xFeature,
    yFeature,
  ]);

  return <div ref={scatterplotRef} />;
}
