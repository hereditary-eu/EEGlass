import { ApiClient } from "./ApiClient";
import { API_ROUTES } from "./ApiRoutes";
import type {
  ModelBandPowerRequest,
  ModelBandPowerResponse,
  ModelBandPowerStatsMode,
  ModelBandPowerStatsResponse,
  ModelClassEvidenceRequest,
  ModelClassEvidenceResponse,
  ModelClassWeightsResponse,
  ModelFeatureImportanceResponse,
  ModelInfoResponse,
  ModelInferenceResponse,
  ModelListResponse,
  ModelPatientEmbeddingsResponse,
  ModelPredictionCacheJobResponse,
  ModelPredictionCacheProgress,
  ModelPredictionCacheStatus,
  ModelScalpTopologyResponse,
  ModelWindowEmbeddingsResponse,
  ModelWindowScalpTopologyResponse,
  TimeseriesSource,
} from "../types";

interface ModelInferenceRequest {
  dataset_id: string;
  subject_id: string;
  source: TimeseriesSource;
}

interface RequestControlOptions {
  signal?: AbortSignal;
}

export class ModelService {
  private static modelListPromise: Promise<ModelListResponse> | null = null;

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
    const resolvedModelName = modelName ?? (await this.getModelList()).current_model_name;
    return ApiClient.get<ModelInfoResponse>(API_ROUTES.model.info(resolvedModelName));
  }

  static async getModelList(): Promise<ModelListResponse> {
    this.modelListPromise ??= ApiClient.get<ModelListResponse>(API_ROUTES.model.list).catch((error) => {
      this.modelListPromise = null;
      throw error;
    });
    return this.modelListPromise;
  }

  static async setCurrentModel(modelName: string): Promise<ModelInfoResponse> {
    const response = await ApiClient.put<ModelInfoResponse>(API_ROUTES.model.current, { model_name: modelName });
    this.modelListPromise = null;
    return response;
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
    options: RequestControlOptions = {},
  ): Promise<ModelPredictionCacheProgress | null> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelPredictionCacheProgress | null>(
      `${API_ROUTES.model.activePredictionCacheJob(datasetId, resolvedModelName)}?${this.toQueryString({ source })}`,
      undefined,
      options.signal,
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

  static async getPatientRawEmbeddings(
    datasetId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelPatientEmbeddingsResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelPatientEmbeddingsResponse>(
      `${API_ROUTES.model.patientRawEmbeddings(datasetId, resolvedModelName)}?${this.toQueryString({ source })}`,
    );
  }

  static async getPatientEmbeddingFeatureImportance(
    datasetId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
    target: "true_label" | "predicted_label" = "true_label",
    method: "shap" = "shap",
  ): Promise<ModelFeatureImportanceResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelFeatureImportanceResponse>(
      `${API_ROUTES.model.patientEmbeddingFeatureImportance(datasetId, resolvedModelName)}?${this.toQueryString({
        source,
        method,
        target,
      })}`,
    );
  }

  static async getWindowEmbeddings(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelWindowEmbeddingsResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelWindowEmbeddingsResponse>(
      `${API_ROUTES.model.windowEmbeddings(datasetId, subjectId, resolvedModelName)}?${this.toQueryString({ source })}`,
    );
  }

  static async getWindowRawEmbeddings(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelWindowEmbeddingsResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelWindowEmbeddingsResponse>(
      `${API_ROUTES.model.windowRawEmbeddings(datasetId, subjectId, resolvedModelName)}?${this.toQueryString({ source })}`,
    );
  }

  static async getWindowEmbeddingFeatureImportance(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
    target: "true_label" | "predicted_label" = "predicted_label",
    method: "shap" = "shap",
  ): Promise<ModelFeatureImportanceResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelFeatureImportanceResponse>(
      `${API_ROUTES.model.windowEmbeddingFeatureImportance(datasetId, subjectId, resolvedModelName)}?${this.toQueryString({
        source,
        method,
        target,
      })}`,
    );
  }

  static async getWindowScalpTopologies(
    datasetId: string,
    subjectId: string,
    windowIndex: number,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
  ): Promise<ModelWindowScalpTopologyResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelWindowScalpTopologyResponse>(
      `${API_ROUTES.model.windowScalpTopologies(datasetId, subjectId, resolvedModelName)}?${this.toQueryString({
        source,
        window_index: windowIndex,
      })}`,
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
    options: RequestControlOptions = {},
  ): Promise<ModelInferenceResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelInferenceResponse>(
      `${API_ROUTES.model.subjectPredictions(datasetId, subjectId, resolvedModelName)}?${this.toQueryString({ source })}`,
      undefined,
      options.signal,
    );
  }

  static async computeAndCachePredictions(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
    modelName?: string,
    options: RequestControlOptions = {},
  ): Promise<ModelInferenceResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.post<ModelInferenceResponse>(
      API_ROUTES.model.subjectPredictions(datasetId, subjectId, resolvedModelName),
      {
        source,
      },
      undefined,
      options.signal,
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

  static async getBandPowerStats(
    datasetId: string,
    subjectId: string,
    source: TimeseriesSource = "derivatives",
    mode: ModelBandPowerStatsMode = "intra_patient",
    modelName?: string,
    cohortLabel?: string | null,
  ): Promise<ModelBandPowerStatsResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelBandPowerStatsResponse>(
      `${API_ROUTES.model.bandPowerStats(datasetId, subjectId, resolvedModelName)}?${this.toQueryString({
        source,
        mode,
        cohort_label: mode === "inter_patient" ? cohortLabel : undefined,
      })}`,
    );
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

  static async getClassWeights(modelName?: string): Promise<ModelClassWeightsResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelClassWeightsResponse>(API_ROUTES.model.classWeights(resolvedModelName));
  }

  static async getScalpTopologies(modelName?: string): Promise<ModelScalpTopologyResponse> {
    const resolvedModelName = await this.resolveModelName(modelName);
    return ApiClient.get<ModelScalpTopologyResponse>(API_ROUTES.model.scalpTopologies(resolvedModelName));
  }

  private static async resolveModelName(modelName?: string): Promise<string> {
    return modelName ?? (await this.getModelList()).current_model_name;
  }

  private static toQueryString(params: Record<string, string | number | null | undefined>): string {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    });

    return searchParams.toString();
  }
}
