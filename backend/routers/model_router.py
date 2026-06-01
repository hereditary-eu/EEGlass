from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from uvicorn.protocols.utils import ClientDisconnected

from backend.ml.model_vars import DEFAULT_MODEL_NAME
from backend.pydantic_models.inference import (
    FeatureImportanceMethod,
    FeatureImportanceTargetColumn,
    ModelBandPowerRequest,
    ModelBandPowerResponse,
    ModelBandPowerStatsResponse,
    ModelClassEvidenceRequest,
    ModelClassEvidenceResponse,
    ModelFeatureImportanceResponse,
    ModelClassWeightsResponse,
    ModelInfoResponse,
    ModelInferenceRequest,
    ModelInferenceResponse,
    ModelListResponse,
    ModelPatientEmbeddingsResponse,
    ModelPredictionCacheJobRequest,
    ModelPredictionCacheJobResponse,
    ModelPredictionCacheProgress,
    ModelPredictionCacheStatus,
    ModelScalpTopologyResponse,
    ModelWindowEmbeddingsResponse,
    ModelWindowScalpTopologyResponse,
    SetCurrentModelRequest,
)
from backend.pydantic_models.timeseries import TimeseriesSource
from backend.services.feature_importance_service import FeatureImportanceService
from backend.services.prediction_cache_service import PredictionCacheService
from backend.services.model_service import (
    ModelDependencyUnavailableError,
    ModelInferenceUnavailableError,
    ModelNotFoundError,
    ModelService,
    ModelServiceError,
    ModelValidationError,
)
from backend.utils.logger import get_logger

logger = get_logger(__name__)
model_router = APIRouter(tags=["model"])


@model_router.get("/models", response_model=ModelListResponse)
async def list_models() -> ModelListResponse:
    try:
        return ModelService.list_models()
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.put("/models/current", response_model=ModelInfoResponse)
async def set_current_model(request: SetCurrentModelRequest) -> ModelInfoResponse:
    try:
        return ModelService.set_current_model(model_name=request.model_name)
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get("/models/default", response_model=ModelInfoResponse)
async def get_default_model_info() -> ModelInfoResponse:
    try:
        return ModelService.get_model_info(model_name=DEFAULT_MODEL_NAME)
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get("/models/{model_name}", response_model=ModelInfoResponse)
async def get_model_info(model_name: str = DEFAULT_MODEL_NAME) -> ModelInfoResponse:
    try:
        return ModelService.get_model_info(model_name=model_name)
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.post("/models/{model_name}/infer", response_model=ModelInferenceResponse)
async def infer_model(
    request: ModelInferenceRequest,
    model_name: str = DEFAULT_MODEL_NAME,
) -> ModelInferenceResponse:
    try:
        return ModelService.infer_subject(
            dataset_id=request.dataset_id,
            subject_id=request.subject_id,
            source=request.source,
            model_name=model_name,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.post("/models/{model_name}/class-evidence", response_model=ModelClassEvidenceResponse)
async def get_model_class_evidence(
    request: ModelClassEvidenceRequest,
    model_name: str = DEFAULT_MODEL_NAME,
) -> ModelClassEvidenceResponse:
    try:
        return ModelService.compute_class_evidence(
            dataset_id=request.dataset_id,
            subject_id=request.subject_id,
            source=request.source,
            window_index=request.window_index,
            model_name=model_name,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get("/models/{model_name}/class-weights", response_model=ModelClassWeightsResponse)
async def get_model_class_weights(model_name: str = DEFAULT_MODEL_NAME) -> ModelClassWeightsResponse:
    try:
        return ModelService.get_class_weights(model_name=model_name)
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.post("/models/{model_name}/band-power", response_model=ModelBandPowerResponse)
async def get_model_band_power(
    request: ModelBandPowerRequest,
    model_name: str = DEFAULT_MODEL_NAME,
) -> ModelBandPowerResponse:
    try:
        return ModelService.compute_band_power(
            dataset_id=request.dataset_id,
            subject_id=request.subject_id,
            source=request.source,
            window_index=request.window_index,
            model_name=model_name,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get(
    "/models/{model_name}/datasets/{dataset_id}/subjects/{subject_id}/band-power-stats",
    response_model=ModelBandPowerStatsResponse,
)
async def get_model_band_power_stats(
    dataset_id: str,
    subject_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
    mode: str = Query("intra_patient"),
    cohort_label: str | None = Query(None),
) -> ModelBandPowerStatsResponse:
    if mode not in ("intra_patient", "inter_patient"):
        raise HTTPException(status_code=400, detail="mode must be either 'intra_patient' or 'inter_patient'.")

    try:
        return PredictionCacheService.get_band_power_stats(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            mode=mode,
            cohort_label=cohort_label,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get("/models/{model_name}/scalp-topologies", response_model=ModelScalpTopologyResponse)
async def get_model_scalp_topologies(model_name: str = DEFAULT_MODEL_NAME) -> ModelScalpTopologyResponse:
    try:
        return ModelService.get_scalp_topologies(model_name=model_name)
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get(
    "/models/{model_name}/datasets/{dataset_id}/subjects/{subject_id}/window-scalp-topologies",
    response_model=ModelWindowScalpTopologyResponse,
)
async def get_window_scalp_topologies(
    dataset_id: str,
    subject_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
    window_index: int = Query(0),
) -> ModelWindowScalpTopologyResponse:
    try:
        return ModelService.compute_window_scalp_topologies(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            window_index=window_index,
            model_name=model_name,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.post(
    "/models/{model_name}/datasets/{dataset_id}/prediction-cache/jobs",
    response_model=ModelPredictionCacheJobResponse,
)
async def start_prediction_cache_job(
    dataset_id: str,
    request: ModelPredictionCacheJobRequest,
    model_name: str = DEFAULT_MODEL_NAME,
) -> ModelPredictionCacheJobResponse:
    try:
        return PredictionCacheService.start_dataset_job(
            dataset_id=dataset_id,
            model_name=model_name,
            source=request.source,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get(
    "/models/{model_name}/datasets/{dataset_id}/prediction-cache",
    response_model=ModelPredictionCacheStatus,
)
async def get_prediction_cache_status(
    dataset_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
) -> ModelPredictionCacheStatus:
    try:
        return PredictionCacheService.get_cache_status(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get(
    "/models/{model_name}/datasets/{dataset_id}/prediction-cache/jobs/active",
    response_model=ModelPredictionCacheProgress | None,
)
async def get_active_prediction_cache_job(
    dataset_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
) -> ModelPredictionCacheProgress | None:
    try:
        return PredictionCacheService.get_active_job_progress(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get(
    "/models/{model_name}/datasets/{dataset_id}/patient-embeddings",
    response_model=ModelPatientEmbeddingsResponse,
)
async def get_patient_embeddings(
    dataset_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
) -> ModelPatientEmbeddingsResponse:
    try:
        response = PredictionCacheService.get_patient_embeddings(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
        )
        _warm_patient_embedding_feature_importance(response)
        return response
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get(
    "/models/{model_name}/datasets/{dataset_id}/patient-embeddings/feature-importance",
    response_model=ModelFeatureImportanceResponse,
)
async def get_patient_embedding_feature_importance(
    dataset_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
    method: FeatureImportanceMethod = Query("shap"),
    target: FeatureImportanceTargetColumn = Query("true_label"),
) -> ModelFeatureImportanceResponse:
    try:
        return FeatureImportanceService.get_patient_embedding_feature_importance(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
            method=method,
            target_column=target,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get(
    "/models/{model_name}/datasets/{dataset_id}/subjects/{subject_id}/window-embeddings",
    response_model=ModelWindowEmbeddingsResponse,
)
async def get_window_embeddings(
    dataset_id: str,
    subject_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
) -> ModelWindowEmbeddingsResponse:
    try:
        response = PredictionCacheService.get_subject_window_embeddings(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
        )
        _warm_window_embedding_feature_importance(response)
        return response
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get(
    "/models/{model_name}/datasets/{dataset_id}/subjects/{subject_id}/window-embeddings/feature-importance",
    response_model=ModelFeatureImportanceResponse,
)
async def get_window_embedding_feature_importance(
    dataset_id: str,
    subject_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
    method: FeatureImportanceMethod = Query("shap"),
    target: FeatureImportanceTargetColumn = Query("predicted_label"),
) -> ModelFeatureImportanceResponse:
    try:
        return FeatureImportanceService.get_window_embedding_feature_importance(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            method=method,
            target_column=target,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.delete(
    "/models/{model_name}/datasets/{dataset_id}/prediction-cache",
    response_model=ModelPredictionCacheStatus,
)
async def delete_prediction_cache(
    dataset_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
) -> ModelPredictionCacheStatus:
    try:
        return PredictionCacheService.delete_cache(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get(
    "/models/{model_name}/datasets/{dataset_id}/subjects/{subject_id}/predictions",
    response_model=ModelInferenceResponse,
)
async def get_cached_subject_predictions(
    dataset_id: str,
    subject_id: str,
    model_name: str = DEFAULT_MODEL_NAME,
    source: TimeseriesSource = Query("derivatives"),
) -> ModelInferenceResponse:
    try:
        return PredictionCacheService.get_subject_predictions(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.post(
    "/models/{model_name}/datasets/{dataset_id}/subjects/{subject_id}/predictions",
    response_model=ModelInferenceResponse,
)
async def compute_cached_subject_predictions(
    dataset_id: str,
    subject_id: str,
    request: ModelPredictionCacheJobRequest,
    model_name: str = DEFAULT_MODEL_NAME,
) -> ModelInferenceResponse:
    try:
        return await PredictionCacheService.compute_subject_predictions(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=request.source,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.websocket("/models/{model_name}/prediction-cache/jobs/{job_id}/progress")
async def watch_prediction_cache_job(websocket: WebSocket, job_id: str, model_name: str = DEFAULT_MODEL_NAME) -> None:
    await websocket.accept()
    try:
        async for payload in PredictionCacheService.watch_job(job_id):
            if payload.get("model_name") not in (None, model_name):
                await websocket.send_json(
                    {
                        "job_id": job_id,
                        "model_name": model_name,
                        "status": "failed",
                        "done": 0,
                        "total": 0,
                        "failed": 1,
                        "message": "Prediction cache job does not belong to this model.",
                    }
                )
                return
            await websocket.send_json(payload)
    except WebSocketDisconnect, ClientDisconnected:
        return


def _http_error(exc: ModelServiceError) -> HTTPException:
    if isinstance(exc, ModelNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ModelValidationError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, (ModelDependencyUnavailableError, ModelInferenceUnavailableError)):
        return HTTPException(status_code=503, detail=str(exc))

    logger.error(f"Model service error: {exc}")
    return HTTPException(status_code=500, detail=str(exc))


def _warm_patient_embedding_feature_importance(response: ModelPatientEmbeddingsResponse) -> None:
    try:
        FeatureImportanceService.warm_patient_embedding_feature_importance(response)
    except ModelServiceError as exc:
        logger.warning(f"Could not warm patient embedding feature importance cache: {exc}")


def _warm_window_embedding_feature_importance(response: ModelWindowEmbeddingsResponse) -> None:
    try:
        FeatureImportanceService.warm_window_embedding_feature_importance(response)
    except ModelServiceError as exc:
        logger.warning(f"Could not warm window embedding feature importance cache: {exc}")
