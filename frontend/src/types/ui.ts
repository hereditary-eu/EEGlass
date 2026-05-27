export type FeatureId = string;

export type FeaturePair = [FeatureId, FeatureId];

export type ChannelId = string;

export interface TimeRange {
  start: number;
  end: number;
}

export type TableViewMode = "numerical" | "heatmap";

export type SimilarityViewMode = "similarity" | "matrix";

export type SimilarityAggregationMethod = "max" | "avg" | "min" | "median";

export type SimilarityColorRangeMode = "min-max" | "full";

export type SimilarityReorderMethod = "none" | "optimal" | "average";

export type TimeseriesSource = "raw" | "derivatives";
export type TimeseriesBandFilter = "delta" | "theta" | "alpha" | "beta1" | "beta2" | "beta3" | "gamma";
export type TimeseriesSubjectSplit = "train" | "val" | "test";

export interface TimeseriesDatasetInfo {
  id: string;
  name?: string | null;
  subject_count: number;
  sources: TimeseriesSource[];
}

export interface TimeseriesSubjectInfo {
  id: string;
  sources: TimeseriesSource[];
  subject_label?: string | null;
  subject_split?: TimeseriesSubjectSplit | null;
}

export interface TimeseriesChannelMetadata {
  name: ChannelId;
  type?: string | null;
  units?: string | null;
}

export interface TimeseriesSubjectMetadata {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  sampling_frequency: number;
  duration: number;
  sample_count: number;
  channel_count: number;
  channels: TimeseriesChannelMetadata[];
  raw_available: boolean;
  derivatives_available: boolean;
  subject_group?: string | null;
  subject_label?: string | null;
  task_name?: string | null;
  recording_type?: string | null;
}

export interface TimeseriesSignalResponse {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  band_filter?: TimeseriesBandFilter | null;
  preview: boolean;
  channels: ChannelId[];
  sampling_frequency: number;
  duration: number;
  start_time: number;
  end_time: number;
  start_sample: number;
  end_sample: number;
  sample_count: number;
  decimation: number;
  samples: Record<ChannelId, number[]>;
}

export interface WindowPrediction {
  window_index: number;
  start_time: number;
  end_time: number;
  predicted_class_id: number;
  predicted_label: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ModelInferenceResponse {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  window_size_seconds: number;
  sampling_frequency: number;
  predictions: WindowPrediction[];
}

export type ModelMetadataValue = string | number | boolean | string[] | number[];

export interface ModelClassPresentation {
  class_id: number;
  label: string;
  compact_label: string;
}

export interface ModelInfoResponse {
  name: string;
  display_name: string;
  architecture: string;
  model_summary: string;
  classes: ModelClassPresentation[];
  metadata: Record<string, ModelMetadataValue>;
}

export interface ModelListItem {
  name: string;
  display_name: string;
  architecture: string;
  is_current: boolean;
}

export interface ModelListResponse {
  current_model_name: string;
  models: ModelListItem[];
}

export interface PatientAggregationSettings {
  strategy: "disease_threshold";
  alzheimer_threshold: number;
  frontotemporal_dementia_threshold: number;
}

export interface ModelPredictionCacheJobResponse {
  job_id: string;
  dataset_id: string;
  model_name: string;
  source: TimeseriesSource;
  status: "queued" | "running" | "completed" | "failed";
}

export interface ModelPredictionCacheProgress {
  job_id: string;
  dataset_id: string;
  model_name: string;
  source: TimeseriesSource;
  status: "queued" | "running" | "completed" | "failed";
  done: number;
  total: number;
  failed: number;
  current_subject_id?: string | null;
  message: string;
}

export interface ModelPredictionClassWindowCount {
  class_id: number;
  class_label: string;
  count: number;
}

export interface ModelPredictionSummary {
  subject_id: string;
  true_label?: string | null;
  predicted_label?: string | null;
  mean_confidence?: number | null;
  total_windows: number;
  windows_per_class: ModelPredictionClassWindowCount[];
}

export interface ModelPredictionCacheStatus {
  dataset_id: string;
  model_name: string;
  source: TimeseriesSource;
  checkpoint_signature: string;
  checkpoint_key: string;
  preprocessing_version: string;
  status: "missing" | "partial" | "complete";
  total_subjects: number;
  completed_subjects: number;
  failed_subjects: number;
  subject_summaries: ModelPredictionSummary[];
  manifest_path: string;
  updated_at?: string | null;
}

export interface ModelPatientEmbeddingPoint {
  subject_id: string;
  x: number;
  y: number;
  true_label?: string | null;
  predicted_label?: string | null;
  mean_confidence?: number | null;
  total_windows: number;
}

export interface ModelPatientEmbeddingReduction {
  method: "pca";
  status: "ok" | "insufficient_data";
  source_dimension: number;
  output_dimension: number;
  explained_variance_ratio: number[];
}

export interface ModelPatientEmbeddingsResponse {
  dataset_id: string;
  model_name: string;
  source: TimeseriesSource;
  checkpoint_signature: string;
  checkpoint_key: string;
  preprocessing_version: string;
  embedding_layer: string;
  embedding_label: string;
  reduction: ModelPatientEmbeddingReduction;
  points: ModelPatientEmbeddingPoint[];
}

export interface ModelWindowEmbeddingPoint {
  window_index: number;
  start_time: number;
  end_time: number;
  x: number;
  y: number;
  predicted_label: string;
  confidence: number;
  cluster_id?: number | null;
}

export interface ModelWindowEmbeddingsResponse {
  dataset_id: string;
  subject_id: string;
  model_name: string;
  source: TimeseriesSource;
  checkpoint_signature: string;
  embedding_layer: string;
  embedding_label: string;
  reduction: ModelPatientEmbeddingReduction;
  points: ModelWindowEmbeddingPoint[];
}

export interface ModelClassEvidenceRequest {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  window_index: number;
}

export interface ModelClassEvidenceContribution {
  class_id: number;
  class_label: string;
  contribution: number;
}

export interface ModelClassWeight {
  class_id: number;
  class_label: string;
  weight: number;
}

export interface ModelClassEvidenceBand {
  band: string;
  feature_value: number;
  class_contributions: ModelClassEvidenceContribution[];
}

export interface ModelClassWeightsBand {
  band: TimeseriesBandFilter;
  class_weights: ModelClassWeight[];
}

export interface ModelClassEvidenceResponse {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  window_index: number;
  start_time: number;
  end_time: number;
  predicted_class_id: number;
  predicted_label: string;
  confidence: number;
  probabilities: Record<string, number>;
  logits: Record<string, number>;
  unit_label: string;
  global_max_abs_contribution: number;
  bands: ModelClassEvidenceBand[];
}

export interface ModelClassWeightsResponse {
  model_name: string;
  checkpoint_signature: string;
  layer_name: string;
  unit_label: string;
  global_max_abs_weight: number;
  bands: ModelClassWeightsBand[];
}

export interface ModelBandPowerRequest {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  window_index: number;
}

export interface ModelBandPowerValue {
  band: string;
  start_hz: number;
  end_hz: number;
  absolute_power: number;
  relative_power: number;
}

export interface ModelChannelBandPower {
  channel: ChannelId;
  bands: ModelBandPowerValue[];
}

export interface ModelBandPowerResponse {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  window_index: number;
  start_time: number;
  end_time: number;
  sampling_frequency: number;
  channels: ModelChannelBandPower[];
}

export type ModelBandPowerStatsMode = "intra_patient" | "inter_patient";

export interface ModelBandPowerStatsValue {
  band: string;
  start_hz: number;
  end_hz: number;
  mean_db: number;
  lower_2sigma_db: number;
  upper_2sigma_db: number;
  sample_count: number;
}

export interface ModelChannelBandPowerStats {
  channel: ChannelId;
  bands: ModelBandPowerStatsValue[];
}

export interface ModelBandPowerStatsResponse {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  mode: ModelBandPowerStatsMode;
  unit_label: string;
  subject_count: number;
  window_count: number;
  channels: ModelChannelBandPowerStats[];
}

export interface ModelScalpTopologyChannel {
  name: ChannelId;
  x: number;
  y: number;
  weight: number;
}

export interface ModelScalpTopologyBand {
  band: string;
  channels: ModelScalpTopologyChannel[];
  grid_values: number[];
}

export interface ModelScalpTopologyGrid {
  resolution: number;
  x: number[];
  y: number[];
}

export interface ModelScalpTopologyResponse {
  layer_name: string;
  unit_label: string;
  global_min_weight: number;
  global_max_weight: number;
  grid: ModelScalpTopologyGrid;
  bands: ModelScalpTopologyBand[];
}

export interface ModelWindowScalpTopologyChannel {
  name: ChannelId;
  x: number;
  y: number;
  value: number;
}

export interface ModelWindowScalpTopologyBand {
  band: TimeseriesBandFilter;
  channels: ModelWindowScalpTopologyChannel[];
  grid_values: number[];
}

export interface ModelWindowScalpTopologyMode {
  mode: "weighted_contribution" | "input_power";
  label: string;
  unit_label: string;
  color_scale: "diverging" | "sequential";
  global_min_value: number;
  global_max_value: number;
  bands: ModelWindowScalpTopologyBand[];
}

export interface ModelWindowScalpTopologyResponse {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  model_name: string;
  checkpoint_signature: string;
  window_index: number;
  start_time: number;
  end_time: number;
  layer_name: string;
  grid: ModelScalpTopologyGrid;
  modes: ModelWindowScalpTopologyMode[];
}
