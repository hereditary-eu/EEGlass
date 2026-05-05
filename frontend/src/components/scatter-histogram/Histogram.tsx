import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

import type { NeuroPatient } from "../../types/neuro";
import {
  NEURO_BINARY_STRING_COLORS,
  NEURO_CLUSTER_COLORS,
  NEURO_DIAGNOSIS_COLORS,
  NEURO_FONT_SIZE,
} from "../../utils/neurodegenvis/visVariables";

interface NeuroHistogramProps {
  patientsData: NeuroPatient[];
  selectedFeature: string;
  categoricalFeature: string;
  kMeanClusters: number;
}

export function NeuroHistogram({
  patientsData,
  selectedFeature,
  categoricalFeature,
  kMeanClusters,
}: NeuroHistogramProps) {
  const histogramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const binNumber = 9;
    let categorySelected = categoricalFeature !== "" && categoricalFeature !== "None";
    let usingClusterColor = false;
    let usingDiagnosisLegend = false;
    let colors: Record<string, string> = NEURO_BINARY_STRING_COLORS;

    if (categoricalFeature === "k_mean_cluster") {
      if (kMeanClusters <= 1) {
        categorySelected = false;
      } else {
        usingClusterColor = true;
        colors = Object.fromEntries(Object.entries(NEURO_CLUSTER_COLORS).map(([key, value]) => [String(key), value]));
      }
    }

    if (categoricalFeature === "z_diagnosis") {
      usingDiagnosisLegend = true;
    }

    let data: NeuroPatient[] | Record<string, string | number | boolean>[] = patientsData;
    if (categorySelected && !usingClusterColor && !usingDiagnosisLegend) {
      data = patientsData.map((patient) => ({
        ...patient,
        [categoricalFeature]: Number(patient[categoricalFeature]) === 1 ? "Done" : "Not Done",
      }));
    }

    const plot = Plot.plot({
      marginBottom: 35,
      marginTop: 25,
      marks: [
        Plot.rectY(
          data,
          Plot.binX(
            { y: "count", thresholds: binNumber },
            {
              x: selectedFeature,
              ...(categorySelected
                ? {
                    ...(usingDiagnosisLegend
                      ? { fill: (datum) => NEURO_DIAGNOSIS_COLORS[String(datum[categoricalFeature])] }
                      : {
                          fill: (datum) => colors[String(datum[categoricalFeature])],
                        }),
                  }
                : {}),
            },
          ),
        ),
        Plot.ruleY([0]),
      ],
      x: {
        label: selectedFeature,
        tickFormat: (value: number) => value.toString(),
      },
      y: {
        label: "Frequency",
        grid: true,
      },
      color: {
        type: "identity",
        ...(categorySelected && !usingClusterColor && !usingDiagnosisLegend
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
      style: `--plot-background: #fbfcfd; font-size: ${NEURO_FONT_SIZE}`,
    });

    if (histogramRef.current) {
      histogramRef.current.innerHTML = "";
      histogramRef.current.append(plot);
    }

    return () => {
      plot.remove();
    };
  }, [categoricalFeature, kMeanClusters, patientsData, selectedFeature]);

  return <div ref={histogramRef} />;
}
