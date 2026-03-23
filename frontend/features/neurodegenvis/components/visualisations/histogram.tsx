import { useEffect, useRef } from "react";
import "../../css/App.css";
import * as Plot from "@observablehq/plot";
import { Patient } from "../../data/Patient";
import { FONTSIZE, CLUSTERCOLORS, COLORS_BIN_STR } from "./vis_variables";

interface plotHistoProps {
  patients_data: Patient[];
  selected_feature: string;
  catFeature: string;
  k_mean_clusters: number;
}

/**
 * Creates and renders the histogram plot
 * @returns JSX.Element
 */
function PlotHisto({ patients_data, selected_feature, catFeature, k_mean_clusters }: plotHistoProps) {
  function createPlot() {
    console.log("plotHisto fun started");
    const binNumber = 9;

    let catFeatureSelected: boolean = catFeature !== "" && catFeature !== "None";

    let colors = COLORS_BIN_STR;
    let k_mean_cluster_sel = false;
    let z_diagnosis_sel = false; // for z_diagnosis, we need to set the color to 0 and 1
    if (catFeature === "k_mean_cluster") {
      if (k_mean_clusters === 1) {
        catFeatureSelected = false;
      } else {
        k_mean_cluster_sel = true;
        colors = CLUSTERCOLORS;
      }
    }
    if (catFeature === "z_diagnosis") {
      z_diagnosis_sel = true; // for z_diagnosis, we need to set the color to 0 and 1
    }

    console.log(
      "catFeature: ",
      catFeature,
      "; catFeatureSelected: ",
      catFeatureSelected,
      ", k_mean_cluster_sel: ",
      k_mean_cluster_sel,
      ", z_diagnosis_sel: ",
      z_diagnosis_sel,
    );

    const diagnosisColors: Record<string, string> = {
      PD: "#1f77b4",
      PDD: "#ff7f0e",
      Unknown: "#9ca3af",
    };

    // dont define as Patient[], because than the map function does not work
    let patients_data_map: { [key: string]: any }[] = patients_data;

    if (catFeatureSelected && !k_mean_cluster_sel && !z_diagnosis_sel) {
      patients_data_map = patients_data.map((p) => ({
        ...p,
        [catFeature]: p[catFeature] === 1 ? "Done" : "Not Done",
      }));
    }

    if (z_diagnosis_sel) {
      patients_data_map = patients_data.map((p) => ({
        ...p,
        __diagnosis_label: typeof p[catFeature] === "string" && p[catFeature].trim() !== "" ? p[catFeature].trim() : "Unknown",
      }));
    }

    const histoPlot = Plot.plot({
      marginBottom: 35,
      marginTop: 25,
      marks: [
        Plot.rectY(
          patients_data_map,
          Plot.binX(
            { y: "count", thresholds: binNumber },
            {
              x: selected_feature,
              ...(catFeatureSelected
                ? {
                    ...(z_diagnosis_sel
                      ? { fill: "__diagnosis_label" }
                      : {
                          fill: (d: Patient) => colors[d[catFeature]],
                        }),
                  }
                : {}),
            },
          ),
        ),
        Plot.ruleY([0]),
        // Plot.tip(
        //     patients_data_map,
        //     Plot.binX(
        //         { y: "count", thresholds: binNumber },
        //         {
        //             x: selected_feature,
        //             ...(catFeatureSelected ? { fill: catFeature } : {}),
        //         }
        //     )
        // ),
        // Plot.ruleX([0])
      ],
      x: {
        label: selected_feature,
        tickFormat: (d: number) => d.toString(),
      },
      y: {
        label: "Frequency",
        grid: true,
      },
      color: {
        ...(catFeatureSelected && !k_mean_cluster_sel && !z_diagnosis_sel
          ? {
              legend: true,
              domain: Object.keys(colors),
              range: Object.values(colors),
            }
          : {}),
        ...(z_diagnosis_sel
          ? {
              legend: true,
              domain: Object.keys(diagnosisColors),
              range: Object.values(diagnosisColors),
            }
          : {}),
      },
      style: "--plot-background: black; font-size: " + FONTSIZE,
    });

    return histoPlot;
  }
  const histoRef = useRef<HTMLDivElement>(null); // Create a ref to access the div element

  // useeffect renders after the first render and after every update.
  // Important, because otherwise scatterplot_ref.current would be null, because it would not rendered yet
  useEffect(() => {
    if (histoRef.current) {
      try {
        histoRef.current.innerHTML = ""; // Clear the div
        histoRef.current.appendChild(createPlot());
      } catch (error) {
        console.error("Histogram rendering failed", error);
        histoRef.current.innerHTML = "<div class=\"neuro-plot-error\">Histogram failed to render.</div>";
      }
    }
  }, [patients_data, selected_feature, catFeature]); //called every time an input changes

  return <div ref={histoRef}></div>;
}

export { PlotHisto };
