from __future__ import annotations

from typing import Dict, List, Literal

from pydantic import BaseModel

from backend.pydantic_models.timeseries import TimeseriesSource


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


class ModelAttributionRequest(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource = "derivatives"
    window_index: int


class ModelAttributionChannel(BaseModel):
    name: str
    signed_score: float
    magnitude: float


class ModelAttributionResponse(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    window_index: int
    start_time: float
    end_time: float
    predicted_class_id: int
    predicted_label: str
    attribution_method: Literal["gradient"]
    global_max_abs_score: float
    channels: List[ModelAttributionChannel]


class ModelClassEvidenceRequest(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource = "derivatives"
    window_index: int


class ModelClassEvidenceContribution(BaseModel):
    class_id: int
    class_label: str
    contribution: float


class ModelClassEvidenceBand(BaseModel):
    band: str
    feature_value: float
    class_contributions: List[ModelClassEvidenceContribution]


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


class ModelBandPowerRequest(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource = "derivatives"


class ModelBandPowerValue(BaseModel):
    band: str
    start_hz: float
    end_hz: float
    absolute_power: float
    relative_power: float


class ModelChannelBandPower(BaseModel):
    channel: str
    bands: List[ModelBandPowerValue]


class ModelBandPowerResponse(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    sampling_frequency: float
    channels: List[ModelChannelBandPower]


class ModelScalpTopologyChannel(BaseModel):
    name: str
    x: float
    y: float
    weight: float


class ModelScalpTopologyBand(BaseModel):
    band: str
    channels: List[ModelScalpTopologyChannel]
    grid_values: List[float]


class ModelScalpTopologyGrid(BaseModel):
    resolution: int
    x: List[float]
    y: List[float]


class ModelScalpTopologyResponse(BaseModel):
    layer_name: str
    unit_label: str
    global_min_weight: float
    global_max_weight: float
    grid: ModelScalpTopologyGrid
    bands: List[ModelScalpTopologyBand]
