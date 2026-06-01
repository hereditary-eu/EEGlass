from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel, field_validator

from backend.ml.model_vars import normalize_model_class_label
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
    ModelClassWeight,
    ModelClassWeightsBand,
    ModelClassWeightsResponse,
)
from backend.pydantic_models.embeddings import (
    ModelPatientEmbeddingPoint,
    ModelPatientEmbeddingReduction,
    ModelPatientEmbeddingsResponse,
    ModelWindowEmbeddingPoint,
    ModelWindowEmbeddingsResponse,
)
from backend.pydantic_models.feature_importance import (
    FeatureImportanceMethod,
    FeatureImportanceStatus,
    FeatureImportanceTargetColumn,
    ModelFeatureImportanceItem,
    ModelFeatureImportanceResponse,
)
from backend.pydantic_models.model_info import (
    ModelBandPresentation,
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

    @field_validator("predicted_label")
    @classmethod
    def normalize_predicted_label(cls, value: str) -> str:
        return normalize_model_class_label(value) or value

    @field_validator("probabilities")
    @classmethod
    def normalize_probability_labels(cls, value: Dict[str, float]) -> Dict[str, float]:
        return {normalize_model_class_label(label) or label: probability for label, probability in value.items()}


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
    "ModelClassWeight",
    "ModelClassWeightsBand",
    "ModelClassWeightsResponse",
    "ModelBandPresentation",
    "ModelClassPresentation",
    "FeatureImportanceMethod",
    "FeatureImportanceStatus",
    "FeatureImportanceTargetColumn",
    "ModelFeatureImportanceItem",
    "ModelFeatureImportanceResponse",
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
