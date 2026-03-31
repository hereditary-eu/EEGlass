export interface NeuroPatient {
  [key: string]: string | number | boolean;
  record_id: number;
  ins_npsi_sex: number;
  insnpsi_age: number;
  npsid_ddur_v: number;
  npsid_yearsed: number;
  overall_domain_sum: number;
  npsid_rep_moca_c: number;
  npsid_rep_mmse_c: number;
  attent_z_comp: number;
  exec_z_comp: number;
  visuosp_z_comp: number;
  memory_z_comp: number;
  language_z_comp: number;
  st_ter_daed: number;
  st_ter_leed: number;
  updrs_3_on: number;
  rc_score_done: number;
  sdmt_done: number;
  flu_a_done: number;
  phon_flu_done: number;
  z_diagnosis: string;
  k_mean_cluster: number;
  pc1: number;
  pc2: number;
  valid_pc: boolean;
}
