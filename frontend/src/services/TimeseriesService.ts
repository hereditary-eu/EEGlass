import { ApiClient } from "./ApiClient";
import { API_ROUTES } from "./ApiRoutes";
import type {
  ChannelId,
  ModelBandPowerRequest,
  ModelBandPowerResponse,
  ModelClassEvidenceRequest,
  ModelClassEvidenceResponse,
  ModelInfoResponse,
  ModelInferenceResponse,
  ModelPatientEmbeddingsResponse,
  ModelPredictionCacheJobResponse,
  ModelPredictionCacheProgress,
  ModelPredictionCacheStatus,
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
  private static defaultModelInfoPromise: Promise<ModelInfoResponse> | null = null;

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
    modelName?: string,
  ): Promise<ModelInferenceResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    const request: ModelInferenceRequest = {
      dataset_id: datasetId,
      subject_id: subjectId,
      source,
    };
    return ApiClient.post<ModelInferenceResponse>(API_ROUTES.model.infer(resolvedModelName), request);
  }

  static async getModelInfo(modelName?: string): Promise<ModelInfoResponse> {
    if (modelName) {
      return ApiClient.get<ModelInfoResponse>(API_ROUTES.model.info(modelName));
    }

    return this.getDefaultModelInfo();
  }

  static async startPredictionCacheJob(
    datasetId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelPredictionCacheJobResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.post<ModelPredictionCacheJobResponse>(
      API_ROUTES.model.startPredictionCacheJob(datasetId, resolvedModelName),
      {
        source,
      },
    );
  }

  static async getPredictionCacheStatus(
    datasetId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelPredictionCacheStatus> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelPredictionCacheStatus>(
      `${API_ROUTES.model.predictionCacheStatus(datasetId, resolvedModelName)}?${this.toQueryString({ source })}`,
    );
  }

  static async getActivePredictionCacheJob(
    datasetId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelPredictionCacheProgress | null> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelPredictionCacheProgress | null>(
      `${API_ROUTES.model.activePredictionCacheJob(datasetId, resolvedModelName)}?${this.toQueryString({ source })}`,
    );
  }

  static async getPatientEmbeddings(
    datasetId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelPatientEmbeddingsResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelPatientEmbeddingsResponse>(
      `${API_ROUTES.model.patientEmbeddings(datasetId, resolvedModelName)}?${this.toQueryString({ source })}`,
    );
  }

  static async deletePredictionCache(
    datasetId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelPredictionCacheStatus> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.delete<ModelPredictionCacheStatus>(
      `${API_ROUTES.model.predictionCacheStatus(datasetId, resolvedModelName)}?${this.toQueryString({ source })}`,
    );
  }

  static async getCachedPredictions(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelInferenceResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelInferenceResponse>(
      `${API_ROUTES.model.subjectPredictions(datasetId, subjectId, resolvedModelName)}?${this.toQueryString({ source })}`,
    );
  }

  static async computeAndCachePredictions(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelInferenceResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.post<ModelInferenceResponse>(
      API_ROUTES.model.subjectPredictions(datasetId, subjectId, resolvedModelName),
      {
        source,
      },
    );
  }

  static createPredictionCacheProgressSocket(jobId: string, modelName: string): WebSocket {
    return new WebSocket(API_ROUTES.model.predictionCacheProgressSocket(jobId, modelName));
  }

  static async computeBandPower(
    datasetId: string,
    subjectId: string,
    windowIndex: number,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelBandPowerResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    const request: ModelBandPowerRequest = {
      dataset_id: datasetId,
      subject_id: subjectId,
      source,
      window_index: windowIndex,
    };
    return ApiClient.post<ModelBandPowerResponse>(API_ROUTES.model.bandPower(resolvedModelName), request);
  }

  static async computeClassEvidence(
    datasetId: string,
    subjectId: string,
    windowIndex: number,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelClassEvidenceResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    const request: ModelClassEvidenceRequest = {
      dataset_id: datasetId,
      subject_id: subjectId,
      source,
      window_index: windowIndex,
    };
    return ApiClient.post<ModelClassEvidenceResponse>(API_ROUTES.model.classEvidence(resolvedModelName), request);
  }

  static async getScalpTopologies(modelName?: string): Promise<ModelScalpTopologyResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelScalpTopologyResponse>(API_ROUTES.model.scalpTopologies(resolvedModelName));
  }

  private static getDefaultModelInfo(): Promise<ModelInfoResponse> {
    this.defaultModelInfoPromise ??= ApiClient.get<ModelInfoResponse>(API_ROUTES.model.defaultInfo).catch((error) => {
      this.defaultModelInfoPromise = null;
      throw error;
    });
    return this.defaultModelInfoPromise;
  }

  private static async resolveModelName(modelName?: string): Promise<string> {
    return modelName ?? (await this.getDefaultModelInfo()).name;
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
