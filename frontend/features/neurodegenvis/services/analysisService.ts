import * as d3 from "d3";
import * as Plot from "@observablehq/plot";
import Papa from "papaparse";
import { Patient } from "../data/Patient";
import { runKmeans } from "../utils/Kmean";
import { pearsonCorrelation } from "../utils/pearson_correlation";
import { PCA_analysis } from "../utils/pca";

export const DEFAULT_NEURO_DATASET_URL = "/tool-assets/neurodegenvis/neuro_sample_dataset.csv";

export interface CorrelationCell {
  a: string;
  b: string;
  correlation: number;
}

export async function loadDataset(datasetPath: string) {
  const response = await fetch(datasetPath, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Dataset request failed: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const blockingError = parsed.errors.find((error) => error.code !== "UndetectableDelimiter");
  if (blockingError) {
    throw new Error(`CSV parse failed at row ${blockingError.row ?? "unknown"}: ${blockingError.message}`);
  }

  return parsed.data.map((row, index) => {
    try {
      return Patient.fromJson(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse patient row ${index + 1}: ${message}`);
    }
  });
}

export function computePca(patientsData: Patient[], numFeatures: string[]) {
  return PCA_analysis({
    patientsData,
    numFeatures,
  });
}

export function clusterPatients(patientsData: Patient[], k: number) {
  let clusteredPatients = patientsData;
  runKmeans(patientsData, (data: Patient[]) => {
    clusteredPatients = data;
  }, k);
  return clusteredPatients;
}

export function getCorrelationMatrix(covFeatures: string[], patientsData: Patient[]): CorrelationCell[] {
  return d3.cross(covFeatures, covFeatures).map(([a, b]) => ({
    a,
    b,
    correlation: pearsonCorrelation(Plot.valueof(patientsData, a) ?? [], Plot.valueof(patientsData, b) ?? []),
  }));
}
