from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from backend.pydantic_models.inference import ModelInferenceResponse
from backend.pydantic_models.timeseries import TimeseriesSource
from backend.services.embedding_service import cluster_embeddings_density
from backend.services.model_service import ModelService
from backend.services.prediction_cache_artifacts import (
    PENULTIMATE_EMBEDDING_LABEL,
    PENULTIMATE_EMBEDDING_LAYER,
    PREPROCESSING_VERSION,
    WINDOW_EMBEDDING_CLUSTERING_METHOD,
    subject_clustering_path,
    subject_path,
    write_json_atomic,
)
from backend.services.prediction_cache_summary import build_prediction_summary
from backend.services.timeseries_service import TimeseriesService, TimeseriesServiceError


def write_prediction_artifact(
    *,
    dataset_id: str,
    subject_id: str,
    model_name: str,
    source: TimeseriesSource,
    checkpoint_signature: str,
    checkpoint_key: str,
    response: ModelInferenceResponse,
    mean_penultimate_embedding: list[float],
    penultimate_embeddings: list[list[float]],
) -> None:
    embedding_values = [float(value) for value in mean_penultimate_embedding]
    window_embedding_values = [[float(value) for value in row] for row in penultimate_embeddings]
    window_embedding_dimension = len(window_embedding_values[0]) if window_embedding_values else 0
    window_embedding_cluster_labels = (
        cluster_embeddings_density(np.asarray(window_embedding_values, dtype=float))
        if len(window_embedding_values) >= 2
        else []
    )
    band_power_stats = ModelService.compute_band_power_stats(
        dataset_id=dataset_id,
        subject_id=subject_id,
        source=source,
        mode="intra_patient",
        model_name=model_name,
    )
    prediction_artifact = {
        "preprocessing_version": PREPROCESSING_VERSION,
        "model_name": model_name,
        "checkpoint_signature": checkpoint_signature,
        "checkpoint_key": checkpoint_key,
        "dataset_id": dataset_id,
        "subject_id": subject_id,
        "source": source,
        "created_at": _now(),
        "summary": build_prediction_summary(
            response=response,
            true_label=_get_subject_label(dataset_id, subject_id),
        ).model_dump(mode="json"),
        "embedding": {
            "layer_name": PENULTIMATE_EMBEDDING_LAYER,
            "label": PENULTIMATE_EMBEDDING_LABEL,
            "dimension": len(embedding_values),
            "values": embedding_values,
        },
        "window_embeddings": {
            "layer_name": PENULTIMATE_EMBEDDING_LAYER,
            "label": PENULTIMATE_EMBEDDING_LABEL,
            "dimension": window_embedding_dimension,
            "values": window_embedding_values,
        },
        "band_power_stats": band_power_stats.model_dump(mode="json"),
        "response": response.model_dump(mode="json"),
    }
    write_json_atomic(
        subject_path(dataset_id, model_name, checkpoint_key, subject_id, source),
        prediction_artifact,
    )
    write_clustering_artifact(
        dataset_id=dataset_id,
        subject_id=subject_id,
        model_name=model_name,
        source=source,
        checkpoint_signature=checkpoint_signature,
        checkpoint_key=checkpoint_key,
        cluster_labels=window_embedding_cluster_labels,
    )


def write_clustering_artifact(
    *,
    dataset_id: str,
    subject_id: str,
    model_name: str,
    source: TimeseriesSource,
    checkpoint_signature: str,
    checkpoint_key: str,
    cluster_labels: list[int | None],
) -> None:
    clustering_artifact = {
        "preprocessing_version": PREPROCESSING_VERSION,
        "model_name": model_name,
        "checkpoint_signature": checkpoint_signature,
        "checkpoint_key": checkpoint_key,
        "dataset_id": dataset_id,
        "subject_id": subject_id,
        "source": source,
        "created_at": _now(),
        "window_embedding_clusters": {
            "method": WINDOW_EMBEDDING_CLUSTERING_METHOD,
            "labels": cluster_labels,
        },
    }
    write_json_atomic(
        subject_clustering_path(dataset_id, model_name, checkpoint_key, subject_id, source),
        clustering_artifact,
    )


def _get_subject_label(dataset_id: str, subject_id: str) -> str | None:
    try:
        return TimeseriesService.get_subject_label(dataset_id, subject_id)
    except TimeseriesServiceError:
        return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
