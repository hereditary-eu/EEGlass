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
