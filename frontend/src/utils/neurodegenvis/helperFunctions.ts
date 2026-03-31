import type { NeuroPatient } from "../../types/neuro";

export function calcMinMaxPatientsData({
  yFeature,
  xFeature,
  patientsData,
}: {
  yFeature: string;
  xFeature: string;
  patientsData: NeuroPatient[];
}) {
  const xValues = patientsData.map((patient) => Number(patient[xFeature])).filter((value) => !Number.isNaN(value));
  const yValues = patientsData.map((patient) => Number(patient[yFeature])).filter((value) => !Number.isNaN(value));

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xRange = maxX - minX;
  const yRange = maxY - minY;
  const marginFactor = 0.03;

  return [
    minX - xRange * marginFactor,
    maxX + xRange * marginFactor,
    minY - yRange * marginFactor,
    maxY + yRange * marginFactor,
  ];
}

export function calcMinMaxMatrix({
  matrix,
  feature1,
  feature2,
}: {
  matrix: number[][];
  feature1: number;
  feature2: number;
}) {
  const xValues = matrix.map((row) => row[feature1]).filter((value) => !Number.isNaN(value));
  const yValues = matrix.map((row) => row[feature2]).filter((value) => !Number.isNaN(value));

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xRange = maxX - minX;
  const yRange = maxY - minY;
  const marginFactor = 0.03;

  return [
    minX - xRange * marginFactor,
    maxX + xRange * marginFactor,
    minY - yRange * marginFactor,
    maxY + yRange * marginFactor,
  ];
}
