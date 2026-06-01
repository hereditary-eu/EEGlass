import { ApiClient } from "./ApiClient";
import { API_ROUTES } from "./ApiRoutes";
import type { ApiClientError } from "../types/cif";
import type {
  ChannelId,
  TimeseriesDatasetInfo,
  TimeseriesBandFilter,
  TimeseriesSignalResponse,
  TimeseriesSource,
  TimeseriesSubjectInfo,
  TimeseriesSubjectMetadata,
} from "../types";

interface TimeseriesDatasetListResponse {
  datasets: TimeseriesDatasetInfo[];
}

interface TimeseriesSubjectListResponse {
  dataset_id: string;
  subjects: TimeseriesSubjectInfo[];
}

export interface TimeseriesSignalRequest {
  channels: ChannelId[];
  source?: TimeseriesSource;
  startTime?: number;
  endTime?: number;
  maxPoints?: number;
  bandFilter?: TimeseriesBandFilter | null;
}

interface RequestControlOptions {
  signal?: AbortSignal;
}

type TimeseriesSignalBinaryMetadata = Omit<TimeseriesSignalResponse, "samples">;

export class TimeseriesService {
  static async getDatasets(): Promise<TimeseriesDatasetInfo[]> {
    const response = await ApiClient.get<TimeseriesDatasetListResponse>(API_ROUTES.timeseries.datasets);
    return response.datasets;
  }

  static async getSubjects(datasetId: string, modelName?: string | null): Promise<TimeseriesSubjectInfo[]> {
    const response = await ApiClient.get<TimeseriesSubjectListResponse>(
      `${API_ROUTES.timeseries.subjects(datasetId)}?${this.toQueryString({ model_name: modelName ?? undefined })}`,
    );
    return response.subjects;
  }

  static async getMetadata(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
    options: RequestControlOptions = {},
  ): Promise<TimeseriesSubjectMetadata> {
    return ApiClient.get<TimeseriesSubjectMetadata>(
      `${API_ROUTES.timeseries.metadata(datasetId, subjectId)}?${this.toQueryString({ source })}`,
      undefined,
      options.signal,
    );
  }

  static async getPreview(
    datasetId: string,
    subjectId: string,
    request: TimeseriesSignalRequest,
    options: RequestControlOptions = {},
  ): Promise<TimeseriesSignalResponse> {
    return ApiClient.get<TimeseriesSignalResponse>(
      `${API_ROUTES.timeseries.preview(datasetId, subjectId)}?${this.toSignalQueryString(request)}`,
      undefined,
      options.signal,
    );
  }

  static async getSignal(
    datasetId: string,
    subjectId: string,
    request: TimeseriesSignalRequest,
    options: RequestControlOptions = {},
  ): Promise<TimeseriesSignalResponse> {
    return this.getSignalFloat32(datasetId, subjectId, request, options);
  }

  private static async getSignalFloat32(
    datasetId: string,
    subjectId: string,
    request: TimeseriesSignalRequest,
    options: RequestControlOptions = {},
  ): Promise<TimeseriesSignalResponse> {
    const response = await fetch(
      `${API_ROUTES.timeseries.signal(datasetId, subjectId)}?${this.toSignalQueryString({
        ...request,
        format: "float32",
      })}`,
      {
        method: "GET",
        signal: options.signal,
      },
    );

    if (!response.ok) {
      const error = new Error(`HTTP Error: ${response.status}`) as ApiClientError;
      error.statusCode = response.status;
      error.response = response;
      throw error;
    }

    const metadataHeader = response.headers.get("X-Timeseries-Signal-Metadata");
    if (!metadataHeader) {
      throw new Error("Timeseries binary response is missing metadata.");
    }

    const metadata = JSON.parse(metadataHeader) as TimeseriesSignalBinaryMetadata;
    const buffer = await response.arrayBuffer();
    const values = new Float32Array(buffer);
    const expectedValueCount = metadata.channels.length * metadata.sample_count;
    if (values.length !== expectedValueCount) {
      throw new Error(
        `Timeseries binary response size mismatch: expected ${expectedValueCount} values, received ${values.length}.`,
      );
    }

    const samples: Record<ChannelId, number[]> = {};
    metadata.channels.forEach((channel, channelIndex) => {
      const start = channelIndex * metadata.sample_count;
      const end = start + metadata.sample_count;
      samples[channel] = Array.from(values.subarray(start, end));
    });

    return {
      ...metadata,
      samples,
    };
  }

  private static toSignalQueryString(request: TimeseriesSignalRequest & { format?: "json" | "float32" }): string {
    return this.toQueryString({
      channels: request.channels.join(","),
      source: request.source ?? "derivatives",
      start_time: request.startTime,
      end_time: request.endTime,
      max_points: request.maxPoints,
      band_filter: request.bandFilter ?? undefined,
      format: request.format,
    });
  }

  private static toQueryString(params: Record<string, string | number | undefined>): string {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return searchParams.toString();
  }
}
