from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from backend.ml.model_vars import normalize_model_class_label
from backend.pydantic_models.timeseries import TimeseriesSource


class ModelContributionDistribution(BaseModel):
    mean: float = Field(ge=0, le=1)
    lower_95: float = Field(ge=0, le=1)
    upper_95: float = Field(ge=0, le=1)


class ModelBranchContributionStats(BaseModel):
    branch: Literal["bp", "scc"]
    share: ModelContributionDistribution
    addend_spread: ModelContributionDistribution | None = None
    cancellation: ModelContributionDistribution | None = None


class ModelBranchContributionSummary(BaseModel):
    version: Literal[1] = 1
    interval_method: Literal["empirical_95"] = "empirical_95"
    window_count: int = Field(ge=1)
    analyzed_window_count: int = Field(ge=1)
    branches: list[ModelBranchContributionStats]


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

    @field_validator("class_label")
    @classmethod
    def normalize_class_label(cls, value: str) -> str:
        return normalize_model_class_label(value) or value


class ModelPredictionSummary(BaseModel):
    subject_id: str
    true_label: str | None = None
    predicted_label: str | None = None
    mean_confidence: float | None = None
    total_windows: int = 0
    windows_per_class: list[ModelPredictionClassWindowCount]
    branch_contributions: ModelBranchContributionSummary | None = None

    @field_validator("true_label", "predicted_label")
    @classmethod
    def normalize_optional_class_label(cls, value: str | None) -> str | None:
        return normalize_model_class_label(value)


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
    subject_summaries: list[ModelPredictionSummary] = Field(default_factory=list)
    manifest_path: str
    updated_at: str | None = None
