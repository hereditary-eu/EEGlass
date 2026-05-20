from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel

from backend.pydantic_models.band_power import (
    ModelBandPowerRequest,
    ModelBandPowerResponse,
    ModelBandPowerStatsResponse,
    ModelBandPowerStatsValue,
    ModelBandPowerValue,
    ModelChannelBandPower,
    ModelChannelBandPowerStats,
)
from backend.pydantic_models.class_evidence import (
    ModelClassEvidenceBand,
    ModelClassEvidenceContribution,
    ModelClassEvidenceRequest,
    ModelClassEvidenceResponse,
)
from backend.pydantic_models.embeddings import (
    ModelPatientEmbeddingPoint,
    ModelPatientEmbeddingReduction,
    ModelPatientEmbeddingsResponse,
    ModelWindowEmbeddingPoint,
    ModelWindowEmbeddingsResponse,
)
from backend.pydantic_models.model_info import (
    ModelClassPresentation,
    ModelInfoResponse,
    ModelListItem,
    ModelListResponse,
    ModelMetadataValue,
    SetCurrentModelRequest,
)
from backend.pydantic_models.prediction_cache import (
    ModelPredictionCacheJobRequest,
    ModelPredictionCacheJobResponse,
    ModelPredictionCacheProgress,
    ModelPredictionCacheStatus,
    ModelPredictionClassWindowCount,
    ModelPredictionSummary,
)
from backend.pydantic_models.timeseries import TimeseriesSource
from backend.pydantic_models.topology import (
    ModelScalpTopologyBand,
    ModelScalpTopologyChannel,
    ModelScalpTopologyGrid,
    ModelScalpTopologyResponse,
    ModelWindowScalpTopologyBand,
    ModelWindowScalpTopologyChannel,
    ModelWindowScalpTopologyMode,
    ModelWindowScalpTopologyResponse,
)


class ModelInferenceRequest(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource = "derivatives"


class WindowPrediction(BaseModel):
    window_index: int
    start_time: float
    end_time: float
    predicted_class_id: int
    predicted_label: str
    confidence: float
    probabilities: Dict[str, float]


class ModelInferenceResponse(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    window_size_seconds: float
    sampling_frequency: float
    predictions: List[WindowPrediction]


__all__ = [
    "ModelBandPowerRequest",
    "ModelBandPowerResponse",
    "ModelBandPowerStatsResponse",
    "ModelBandPowerStatsValue",
    "ModelBandPowerValue",
    "ModelChannelBandPower",
    "ModelChannelBandPowerStats",
    "ModelClassEvidenceBand",
    "ModelClassEvidenceContribution",
    "ModelClassEvidenceRequest",
    "ModelClassEvidenceResponse",
    "ModelClassPresentation",
    "ModelInfoResponse",
    "ModelInferenceRequest",
    "ModelInferenceResponse",
    "ModelListItem",
    "ModelListResponse",
    "ModelMetadataValue",
    "ModelPatientEmbeddingPoint",
    "ModelPatientEmbeddingReduction",
    "ModelPatientEmbeddingsResponse",
    "ModelPredictionCacheJobRequest",
    "ModelPredictionCacheJobResponse",
    "ModelPredictionCacheProgress",
    "ModelPredictionCacheStatus",
    "ModelPredictionClassWindowCount",
    "ModelPredictionSummary",
    "ModelScalpTopologyBand",
    "ModelScalpTopologyChannel",
    "ModelScalpTopologyGrid",
    "ModelScalpTopologyResponse",
    "ModelWindowEmbeddingPoint",
    "ModelWindowEmbeddingsResponse",
    "ModelWindowScalpTopologyBand",
    "ModelWindowScalpTopologyChannel",
    "ModelWindowScalpTopologyMode",
    "ModelWindowScalpTopologyResponse",
    "SetCurrentModelRequest",
    "WindowPrediction",
]
