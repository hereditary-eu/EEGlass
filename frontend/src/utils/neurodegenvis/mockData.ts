import type { NeuroPatient } from "../../types/neuro";
import { assignNeuroKMeansClusters } from "../../utils/neurodegenvis/kmeans";
import { runNeuroPcaAnalysis } from "../../utils/neurodegenvis/pca";

const DIAGNOSES = ["PD", "DLB", "AD"];

export const NEURO_CATEGORICAL_FEATURES = ["None", "k_mean_cluster", "z_diagnosis", "flu_a_done", "rc_score_done"];

export const NEURO_COVARIATE_FEATURES = [
  "insnpsi_age",
  "npsid_ddur_v",
  "ins_npsi_sex",
  "npsid_yearsed",
  "overall_domain_sum",
  "npsid_rep_moca_c",
  "npsid_rep_mmse_c",
  "attent_z_comp",
  "exec_z_comp",
  "visuosp_z_comp",
  "memory_z_comp",
  "language_z_comp",
  "st_ter_daed",
  "st_ter_leed",
  "updrs_3_on",
  "rc_score_done",
  "sdmt_done",
  "flu_a_done",
  "phon_flu_done",
  "pc1",
  "pc2",
];

export const NEURO_INITIAL_COVARIATE_FEATURES = [
  "insnpsi_age",
  "npsid_ddur_v",
  "npsid_yearsed",
  "overall_domain_sum",
  "npsid_rep_moca_c",
  "npsid_rep_mmse_c",
  "attent_z_comp",
  "exec_z_comp",
  "visuosp_z_comp",
  "memory_z_comp",
  "language_z_comp",
  "st_ter_daed",
  "st_ter_leed",
  "updrs_3_on",
  "pc1",
  "pc2",
];

export const NEURO_PLOTTABLE_FEATURES = [
  "insnpsi_age",
  "npsid_ddur_v",
  "npsid_yearsed",
  "overall_domain_sum",
  "npsid_rep_moca_c",
  "npsid_rep_mmse_c",
  "attent_z_comp",
  "exec_z_comp",
  "visuosp_z_comp",
  "memory_z_comp",
  "language_z_comp",
  "st_ter_daed",
  "st_ter_leed",
  "updrs_3_on",
  "pc1",
  "pc2",
];

export const NEURO_INITIAL_SCATTER_FEATURES: [string, string] = ["insnpsi_age", "visuosp_z_comp"];

export const NEURO_PCA_FEATURES = [
  "insnpsi_age",
  "npsid_ddur_v",
  "npsid_yearsed",
  "overall_domain_sum",
  "npsid_rep_moca_c",
  "npsid_rep_mmse_c",
  "attent_z_comp",
  "exec_z_comp",
  "visuosp_z_comp",
  "memory_z_comp",
  "language_z_comp",
];

export const NEURO_INITIAL_BIPLOT_FEATURES = [
  "npsid_ddur_v",
  "overall_domain_sum",
  "npsid_rep_mmse_c",
  "npsid_rep_moca_c",
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function buildBaseMockNeuroPatients(): NeuroPatient[] {
  return Array.from({ length: 30 }, (_, index) => {
    const diagnosis = DIAGNOSES[index % DIAGNOSES.length];
    const diagnosisShift = diagnosis === "PD" ? 0 : diagnosis === "DLB" ? -0.55 : 0.75;
    const sex = index % 2;
    const education = 11 + (index % 6) + (sex === 0 ? 0.5 : 0);
    const age = 56 + index * 0.82 + diagnosisShift * 3 + (index % 3) * 0.9;
    const diseaseDuration = 1.6 + index * 0.24 + Math.abs(diagnosisShift) * 0.8;
    const moca = clamp(28.8 - diseaseDuration * 0.52 - diagnosisShift * 1.4 + (index % 4) * 0.28, 17, 30);
    const mmse = clamp(29.2 - diseaseDuration * 0.34 - diagnosisShift * 0.9 + (index % 5) * 0.22, 18, 30);
    const attention = 0.95 - diseaseDuration * 0.08 - diagnosisShift * 0.32 + ((index % 4) - 1.5) * 0.09;
    const executive = 0.72 - diseaseDuration * 0.09 - diagnosisShift * 0.37 + ((index % 5) - 2) * 0.07;
    const visuospatial = 0.81 - diseaseDuration * 0.07 - diagnosisShift * 0.22 + ((index % 6) - 2.5) * 0.06;
    const memory = 0.64 - diseaseDuration * 0.06 - diagnosisShift * 0.31 + ((index % 4) - 1) * 0.08;
    const language = 0.78 - diseaseDuration * 0.05 - diagnosisShift * 0.27 + ((index % 3) - 1) * 0.07;
    const overallDomainSum = attention + executive + visuospatial + memory + language;
    const levodopaEquivalent = 185 + diseaseDuration * 56 + (diagnosis === "PD" ? 35 : 10) + index * 3.4;
    const dopamineEquivalent = 95 + diseaseDuration * 37 + (diagnosis === "DLB" ? 18 : 8) + index * 2.6;
    const updrs = 18 + diseaseDuration * 2.8 + (diagnosis === "PD" ? 4.5 : 2.2) + (index % 4) * 1.4;

    return {
      record_id: 1000 + index,
      ins_npsi_sex: sex,
      insnpsi_age: round(age),
      npsid_ddur_v: round(diseaseDuration),
      npsid_yearsed: round(education),
      overall_domain_sum: round(overallDomainSum),
      npsid_rep_moca_c: round(moca),
      npsid_rep_mmse_c: round(mmse),
      attent_z_comp: round(attention),
      exec_z_comp: round(executive),
      visuosp_z_comp: round(visuospatial),
      memory_z_comp: round(memory),
      language_z_comp: round(language),
      st_ter_daed: round(dopamineEquivalent),
      st_ter_leed: round(levodopaEquivalent),
      updrs_3_on: round(updrs),
      rc_score_done: index % 2,
      sdmt_done: index % 3 === 0 ? 0 : 1,
      flu_a_done: index % 4 === 0 ? 0 : 1,
      phon_flu_done: index % 5 === 0 ? 0 : 1,
      z_diagnosis: diagnosis,
      k_mean_cluster: -1,
      pc1: Number.NaN,
      pc2: Number.NaN,
      valid_pc: false,
    };
  });
}

export function createMockNeuroDataset(k = 3) {
  const patients = buildBaseMockNeuroPatients();
  const loadings = runNeuroPcaAnalysis(patients, NEURO_PCA_FEATURES);
  const clusteredPatients = assignNeuroKMeansClusters(patients, k);

  return {
    patients: clusteredPatients,
    loadings,
  };
}
