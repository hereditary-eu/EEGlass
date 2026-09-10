from __future__ import annotations

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
    start_hz: float = 0
    end_hz: float = 0
    feature_value: float
    class_contributions: list[ModelClassEvidenceContribution]


class ModelClassWeightsBand(BaseModel):
    band: str
    start_hz: float = 0
    end_hz: float = 0
    class_weights: list[ModelClassWeight]


class ModelSCCEvidence(BaseModel):
    bands: list[ModelClassEvidenceBand]


class ModelSCCWeights(BaseModel):
    bands: list[ModelClassWeightsBand]


class ModelClassEvidenceResponse(BaseModel):
    scc: ModelSCCEvidence | None = None
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    window_index: int
    start_time: float
    end_time: float
    predicted_class_id: int
    predicted_label: str
    confidence: float
    probabilities: dict[str, float]
    logits: dict[str, float]
    unit_label: str
    global_max_abs_contribution: float
    bands: list[ModelClassEvidenceBand]


class ModelClassWeightsResponse(BaseModel):
    scc: ModelSCCWeights | None = None
    model_name: str
    checkpoint_signature: str
    layer_name: str
    unit_label: str
    global_max_abs_weight: float
    bands: list[ModelClassWeightsBand]
