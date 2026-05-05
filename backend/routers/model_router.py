from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.pydantic_models.inference import (
    ModelAttributionRequest,
    ModelAttributionResponse,
    ModelBandPowerRequest,
    ModelBandPowerResponse,
    ModelClassEvidenceRequest,
    ModelClassEvidenceResponse,
    ModelInferenceRequest,
    ModelInferenceResponse,
    ModelScalpTopologyResponse,
)
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
model_router = APIRouter(prefix="/model", tags=["model"])


@model_router.post("/infer", response_model=ModelInferenceResponse)
async def infer_model(request: ModelInferenceRequest) -> ModelInferenceResponse:
    try:
        return ModelService.infer_subject(
            dataset_id=request.dataset_id,
            subject_id=request.subject_id,
            source=request.source,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.post("/attribution", response_model=ModelAttributionResponse)
async def get_model_attribution(request: ModelAttributionRequest) -> ModelAttributionResponse:
    try:
        return ModelService.attribute_window(
            dataset_id=request.dataset_id,
            subject_id=request.subject_id,
            source=request.source,
            window_index=request.window_index,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.post("/class-evidence", response_model=ModelClassEvidenceResponse)
async def get_model_class_evidence(request: ModelClassEvidenceRequest) -> ModelClassEvidenceResponse:
    try:
        return ModelService.compute_class_evidence(
            dataset_id=request.dataset_id,
            subject_id=request.subject_id,
            source=request.source,
            window_index=request.window_index,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.post("/band-power", response_model=ModelBandPowerResponse)
async def get_model_band_power(request: ModelBandPowerRequest) -> ModelBandPowerResponse:
    try:
        return ModelService.compute_band_power(
            dataset_id=request.dataset_id,
            subject_id=request.subject_id,
            source=request.source,
        )
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


@model_router.get("/scalp-topologies", response_model=ModelScalpTopologyResponse)
async def get_model_scalp_topologies() -> ModelScalpTopologyResponse:
    try:
        return ModelService.get_scalp_topologies()
    except ModelServiceError as exc:
        raise _http_error(exc) from exc


def _http_error(exc: ModelServiceError) -> HTTPException:
    if isinstance(exc, ModelNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ModelValidationError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, (ModelDependencyUnavailableError, ModelInferenceUnavailableError)):
        return HTTPException(status_code=503, detail=str(exc))

    logger.error(f"Model service error: {exc}")
    return HTTPException(status_code=500, detail=str(exc))
