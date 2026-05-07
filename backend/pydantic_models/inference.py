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


ModelMetadataValue = str | int | float | bool | List[str] | List[int] | List[float]


class ModelClassColors(BaseModel):
    annotation: str
    distribution: str
    embedding_fill: str
    embedding_stroke: str


class ModelClassPresentation(BaseModel):
    class_id: int
    label: str
    compact_label: str
    colors: ModelClassColors


class ModelBandPresentation(BaseModel):
    name: str
    label: str
    start_hz: float
    end_hz: float


class ModelInfoResponse(BaseModel):
    name: str
    display_name: str
    architecture: str
    classes: List[ModelClassPresentation]
    bands: List[ModelBandPresentation]
    metadata: Dict[str, ModelMetadataValue]


class ModelPredictionCacheJobRequest(BaseModel):
    source: TimeseriesSource = "derivatives"


class ModelPredictionCacheJobResponse(BaseModel):
    job_id: str
    dataset_id: str
    model_name: str
    source: TimeseriesSource
    status: Literal["queued", "running", "completed", "failed"]


class ModelPredictionCacheProgress(BaseModel):
    job_id: str
    dataset_id: str
    model_name: str
    source: TimeseriesSource
    status: Literal["queued", "running", "completed", "failed"]
    done: int
    total: int
    failed: int
    current_subject_id: str | None = None
    message: str = ""


class ModelPredictionClassWindowCount(BaseModel):
    class_id: int
    class_label: str
    count: int


class ModelPredictionSummary(BaseModel):
    subject_id: str
    true_label: str | None = None
    predicted_label: str | None = None
    mean_confidence: float | None = None
    total_windows: int = 0
    windows_per_class: List[ModelPredictionClassWindowCount]


class ModelPredictionCacheStatus(BaseModel):
    dataset_id: str
    model_name: str
    source: TimeseriesSource
    checkpoint_signature: str
    checkpoint_key: str
    preprocessing_version: str
    status: Literal["missing", "partial", "complete"]
    total_subjects: int
    completed_subjects: int
    failed_subjects: int
    subject_summaries: List[ModelPredictionSummary] = []
    manifest_path: str
    updated_at: str | None = None


class ModelPatientEmbeddingPoint(BaseModel):
    subject_id: str
    x: float
    y: float
    true_label: str | None = None
    predicted_label: str | None = None
    mean_confidence: float | None = None
    total_windows: int


class ModelPatientEmbeddingReduction(BaseModel):
    method: Literal["pca"]
    status: Literal["ok", "insufficient_data"]
    source_dimension: int
    output_dimension: int
    explained_variance_ratio: List[float]


class ModelPatientEmbeddingsResponse(BaseModel):
    dataset_id: str
    model_name: str
    source: TimeseriesSource
    checkpoint_signature: str
    checkpoint_key: str
    preprocessing_version: str
    embedding_layer: str
    embedding_label: str
    reduction: ModelPatientEmbeddingReduction
    points: List[ModelPatientEmbeddingPoint]


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
    window_index: int


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
    window_index: int
    start_time: float
    end_time: float
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
