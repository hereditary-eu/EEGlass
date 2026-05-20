from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field

from backend.pydantic_models.timeseries import TimeseriesSource


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
    subject_summaries: List[ModelPredictionSummary] = Field(default_factory=list)
    manifest_path: str
    updated_at: str | None = None
