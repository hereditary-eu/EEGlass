import { PCA } from "ml-pca";

import type { NeuroPatient } from "../../types/neuro";

export function runNeuroPcaAnalysis(patients: NeuroPatient[], numericFeatures: string[]) {
  const validIndices: number[] = [];

  const numericRows = patients
    .map((patient, index) => {
      const row = numericFeatures.map((feature) => Number(patient[feature]));
      if (row.some((value) => Number.isNaN(value))) {
        return null;
      }

      validIndices.push(index);
      return row;
    })
    .filter((row): row is number[] => row !== null);

  const pca = new PCA(numericRows, { scale: true, center: true });
  const projections = pca.predict(numericRows).to2DArray();

  validIndices.forEach((originalIndex, projectionIndex) => {
    patients[originalIndex].pc1 = projections[projectionIndex][0];
    patients[originalIndex].pc2 = projections[projectionIndex][1];
    patients[originalIndex].valid_pc = true;
  });

  patients.forEach((patient, index) => {
    if (!validIndices.includes(index)) {
      patient.pc1 = Number.NaN;
      patient.pc2 = Number.NaN;
      patient.valid_pc = false;
    }
  });

  return pca.getLoadings().to2DArray();
}
