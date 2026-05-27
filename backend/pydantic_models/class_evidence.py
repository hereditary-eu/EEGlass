from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel

from backend.pydantic_models.timeseries import TimeseriesSource


class ModelClassEvidenceRequest(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource = "derivatives"
    window_index: int


class ModelClassEvidenceContribution(BaseModel):
    class_id: int
    class_label: str
    contribution: float


class ModelClassWeight(BaseModel):
    class_id: int
    class_label: str
    weight: float


class ModelClassEvidenceBand(BaseModel):
    band: str
    feature_value: float
    class_contributions: List[ModelClassEvidenceContribution]


class ModelClassWeightsBand(BaseModel):
    band: str
    class_weights: List[ModelClassWeight]


class ModelClassEvidenceResponse(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    window_index: int
    start_time: float
    end_time: float
    predicted_class_id: int
    predicted_label: str
    confidence: float
    probabilities: Dict[str, float]
    logits: Dict[str, float]
    unit_label: str
    global_max_abs_contribution: float
    bands: List[ModelClassEvidenceBand]


class ModelClassWeightsResponse(BaseModel):
    model_name: str
    checkpoint_signature: str
    layer_name: str
    unit_label: str
    global_max_abs_weight: float
    bands: List[ModelClassWeightsBand]
