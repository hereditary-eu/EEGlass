from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from uvicorn.protocols.utils import ClientDisconnected

from backend.ml.model_registry import DEFAULT_MODEL_NAME
from backend.pydantic_models.inference import (
    ModelBandPowerRequest,
    ModelBandPowerResponse,
    ModelClassEvidenceRequest,
    ModelClassEvidenceResponse,
    ModelInfoResponse,
    ModelInferenceRequest,
    ModelInferenceResponse,
    ModelPatientEmbeddingsResponse,
    ModelPredictionCacheJobRequest,
    ModelPredictionCacheJobResponse,
    ModelPredictionCacheProgress,
    ModelPredictionCacheStatus,
    ModelScalpTopologyResponse,
)
from backend.pydantic_models.timeseries import TimeseriesSource
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


@model_router.get("/models/{model_name}/scalp-topologies", response_model=ModelScalpTopologyResponse)
async def get_model_scalp_topologies(model_name: str = DEFAULT_MODEL_NAME) -> ModelScalpTopologyResponse:
    try:
        return ModelService.get_scalp_topologies(model_name=model_name)
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
        return PredictionCacheService.get_patient_embeddings(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
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
