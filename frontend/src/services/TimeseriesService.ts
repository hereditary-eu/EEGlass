import { ApiClient } from "./ApiClient";
import { API_ROUTES } from "./ApiRoutes";
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
    return ApiClient.get<TimeseriesSignalResponse>(
      `${API_ROUTES.timeseries.signal(datasetId, subjectId)}?${this.toSignalQueryString(request)}`,
      undefined,
      options.signal,
    );
  }

  private static toSignalQueryString(request: TimeseriesSignalRequest): string {
    return this.toQueryString({
      channels: request.channels.join(","),
      source: request.source ?? "derivatives",
      start_time: request.startTime,
      end_time: request.endTime,
      max_points: request.maxPoints,
      band_filter: request.bandFilter ?? undefined,
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
