from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from backend.pydantic_models.timeseries import TimeseriesSource

EmbeddingReductionMethod = Literal["pca", "tsne", "umap"]


class ModelPatientEmbeddingPoint(BaseModel):
    subject_id: str
    x: float
    y: float
    raw_embedding: list[float] | None = None
    true_label: str | None = None
    predicted_label: str | None = None
    mean_confidence: float | None = None
    total_windows: int


class ModelPatientEmbeddingReduction(BaseModel):
    method: EmbeddingReductionMethod
    status: Literal["ok", "insufficient_data"]
    source_dimension: int
    output_dimension: int
    explained_variance_ratio: list[float]


class ModelPatientEmbeddingsResponse(BaseModel):
    dataset_id: str
    model_name: str
    source: TimeseriesSource
    checkpoint_signature: str
    checkpoint_key: str
    preprocessing_version: str
    embedding_layer: str
    embedding_label: str
    feature_names: list[str]
    reduction: ModelPatientEmbeddingReduction
    points: list[ModelPatientEmbeddingPoint]


class ModelWindowEmbeddingPoint(BaseModel):
    window_index: int
    start_time: float
    end_time: float
    x: float
    y: float
    raw_embedding: list[float] | None = None
    predicted_label: str
    confidence: float
    cluster_id: int | None = None


class ModelWindowEmbeddingsResponse(BaseModel):
    dataset_id: str
    subject_id: str
    model_name: str
    source: TimeseriesSource
    checkpoint_signature: str
    embedding_layer: str
    embedding_label: str
    feature_names: list[str]
    reduction: ModelPatientEmbeddingReduction
    points: list[ModelWindowEmbeddingPoint]
