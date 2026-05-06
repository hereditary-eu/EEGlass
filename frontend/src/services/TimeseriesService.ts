import { ApiClient } from "./ApiClient";
import { API_ROUTES } from "./ApiRoutes";
import type {
  ChannelId,
  ModelAttributionRequest,
  ModelAttributionResponse,
  ModelBandPowerRequest,
  ModelBandPowerResponse,
  ModelClassEvidenceRequest,
  ModelClassEvidenceResponse,
  ModelInferenceResponse,
  ModelScalpTopologyResponse,
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

interface ModelInferenceRequest {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
}

export class TimeseriesService {
  static async getDatasets(): Promise<TimeseriesDatasetInfo[]> {
    const response = await ApiClient.get<TimeseriesDatasetListResponse>(API_ROUTES.timeseries.datasets);
    return response.datasets;
  }

  static async getSubjects(datasetId: string): Promise<TimeseriesSubjectInfo[]> {
    const response = await ApiClient.get<TimeseriesSubjectListResponse>(API_ROUTES.timeseries.subjects(datasetId));
    return response.subjects;
  }

  static async getMetadata(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
  ): Promise<TimeseriesSubjectMetadata> {
    return ApiClient.get<TimeseriesSubjectMetadata>(
      `${API_ROUTES.timeseries.metadata(datasetId, subjectId)}?${this.toQueryString({ source })}`,
    );
  }

  static async getPreview(
    datasetId: string,
    subjectId: string,
    request: TimeseriesSignalRequest,
  ): Promise<TimeseriesSignalResponse> {
    return ApiClient.get<TimeseriesSignalResponse>(
      `${API_ROUTES.timeseries.preview(datasetId, subjectId)}?${this.toSignalQueryString(request)}`,
    );
  }

  static async getSignal(
    datasetId: string,
    subjectId: string,
    request: TimeseriesSignalRequest,
  ): Promise<TimeseriesSignalResponse> {
    return ApiClient.get<TimeseriesSignalResponse>(
      `${API_ROUTES.timeseries.signal(datasetId, subjectId)}?${this.toSignalQueryString(request)}`,
    );
  }

  static async computeInference(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
  ): Promise<ModelInferenceResponse> {
    const request: ModelInferenceRequest = {
      dataset_id: datasetId,
      subject_id: subjectId,
      source,
    };
    return ApiClient.post<ModelInferenceResponse>(API_ROUTES.model.infer, request);
  }

  static async computeAttribution(
    datasetId: string,
    subjectId: string,
    windowIndex: number,
    source: TimeseriesSource = "derivatives",
  ): Promise<ModelAttributionResponse> {
    const request: ModelAttributionRequest = {
      dataset_id: datasetId,
      subject_id: subjectId,
      source,
      window_index: windowIndex,
    };
    return ApiClient.post<ModelAttributionResponse>(API_ROUTES.model.attribution, request);
  }

  static async computeBandPower(
    datasetId: string,
    subjectId: string,
    windowIndex: number,
    source: TimeseriesSource = "derivatives",
  ): Promise<ModelBandPowerResponse> {
    const request: ModelBandPowerRequest = {
      dataset_id: datasetId,
      subject_id: subjectId,
      source,
      window_index: windowIndex,
    };
    return ApiClient.post<ModelBandPowerResponse>(API_ROUTES.model.bandPower, request);
  }

  static async computeClassEvidence(
    datasetId: string,
    subjectId: string,
    windowIndex: number,
    source: TimeseriesSource = "derivatives",
  ): Promise<ModelClassEvidenceResponse> {
    const request: ModelClassEvidenceRequest = {
      dataset_id: datasetId,
      subject_id: subjectId,
      source,
      window_index: windowIndex,
    };
    return ApiClient.post<ModelClassEvidenceResponse>(API_ROUTES.model.classEvidence, request);
  }

  static async getScalpTopologies(): Promise<ModelScalpTopologyResponse> {
    return ApiClient.get<ModelScalpTopologyResponse>(API_ROUTES.model.scalpTopologies);
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
