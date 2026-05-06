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

export interface TimeseriesDatasetInfo {
  id: string;
  name?: string | null;
  subject_count: number;
  sources: TimeseriesSource[];
}

export interface TimeseriesSubjectInfo {
  id: string;
  sources: TimeseriesSource[];
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

export interface ModelAttributionRequest {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  window_index: number;
}

export interface ModelAttributionChannel {
  name: ChannelId;
  signed_score: number;
  magnitude: number;
}

export interface ModelAttributionResponse {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
  window_index: number;
  start_time: number;
  end_time: number;
  predicted_class_id: number;
  predicted_label: string;
  attribution_method: "gradient";
  global_max_abs_score: number;
  channels: ModelAttributionChannel[];
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

export interface ModelClassEvidenceBand {
  band: string;
  feature_value: number;
  class_contributions: ModelClassEvidenceContribution[];
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
