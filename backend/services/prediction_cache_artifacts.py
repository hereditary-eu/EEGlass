from __future__ import annotations

import hashlib
import json
import time
import uuid
from pathlib import Path
from typing import Any

import numpy as np

from backend.config import CONFIG
from backend.ml.model_vars import MODEL_BANDS, MODEL_CHANNELS
from backend.pydantic_models.timeseries import TimeseriesSource

PREPROCESSING_VERSION = "xeegnet-preprocessing-v3-band-power-stats"
PENULTIMATE_EMBEDDING_LAYER = "encoder"
PENULTIMATE_EMBEDDING_LABEL = "penultimate embedding"
WINDOW_EMBEDDING_CLUSTERING_METHOD = "dbscan"


def checkpoint_key(checkpoint_signature: str) -> str:
    return f"checkpoint-{hashlib.sha256(checkpoint_signature.encode('utf-8')).hexdigest()[:16]}"


def cache_dir(dataset_id: str, model_name: str, checkpoint_key_value: str) -> Path:
    return Path(CONFIG.MODEL_OUTPUT_STORAGE_DIR) / dataset_id / model_name / checkpoint_key_value


def manifest_path(dataset_id: str, model_name: str, checkpoint_key_value: str, source: TimeseriesSource) -> Path:
    return cache_dir(dataset_id, model_name, checkpoint_key_value) / f"manifest.{source}.json"


def subject_path(
    dataset_id: str,
    model_name: str,
    checkpoint_key_value: str,
    subject_id: str,
    source: TimeseriesSource,
) -> Path:
    return (
        cache_dir(dataset_id, model_name, checkpoint_key_value) / "subjects" / f"{subject_id}.{source}.predictions.json"
    )


def subject_clustering_path(
    dataset_id: str,
    model_name: str,
    checkpoint_key_value: str,
    subject_id: str,
    source: TimeseriesSource,
) -> Path:
    return cache_dir(dataset_id, model_name, checkpoint_key_value) / "subjects" / f"{subject_id}.{source}.clusters.json"


def read_manifest(
    dataset_id: str,
    model_name: str,
    checkpoint_key_value: str,
    source: TimeseriesSource,
) -> dict[str, Any]:
    return read_json(manifest_path(dataset_id, model_name, checkpoint_key_value, source)) or {}


def read_prediction_artifact(
    dataset_id: str,
    model_name: str,
    checkpoint_key_value: str,
    subject_id: str,
    source: TimeseriesSource,
) -> dict[str, Any] | None:
    return read_json(subject_path(dataset_id, model_name, checkpoint_key_value, subject_id, source))


def read_clustering_artifact(
    dataset_id: str,
    model_name: str,
    checkpoint_key_value: str,
    subject_id: str,
    source: TimeseriesSource,
) -> dict[str, Any] | None:
    return read_json(subject_clustering_path(dataset_id, model_name, checkpoint_key_value, subject_id, source))


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    with temp_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, sort_keys=True)
    temp_path.replace(path)


def cleanup_stale_temp_files(target_cache_dir: Path) -> None:
    if not target_cache_dir.is_dir():
        return

    cutoff = time.time() - max(60, CONFIG.MODEL_OUTPUT_TMP_MAX_AGE_SECONDS)
    for temp_path in target_cache_dir.rglob("*.tmp"):
        try:
            if temp_path.stat().st_mtime < cutoff:
                temp_path.unlink()
        except OSError:
            continue


def is_manifest_valid(
    manifest: dict[str, Any] | None,
    dataset_id: str,
    model_name: str,
    source: TimeseriesSource,
    checkpoint_signature: str,
    checkpoint_key_value: str,
) -> bool:
    return bool(
        manifest
        and manifest.get("preprocessing_version") == PREPROCESSING_VERSION
        and manifest.get("dataset_id") == dataset_id
        and manifest.get("model_name") == model_name
        and manifest.get("source") == source
        and manifest.get("checkpoint_signature") == checkpoint_signature
        and manifest.get("checkpoint_key") == checkpoint_key_value
    )


def is_model_artifact_valid(
    artifact: dict[str, Any] | None,
    *,
    dataset_id: str,
    subject_id: str,
    model_name: str,
    source: TimeseriesSource,
    checkpoint_signature: str,
    checkpoint_key_value: str,
) -> bool:
    return bool(
        artifact
        and artifact.get("preprocessing_version") == PREPROCESSING_VERSION
        and artifact.get("dataset_id") == dataset_id
        and artifact.get("subject_id") == subject_id
        and artifact.get("model_name") == model_name
        and artifact.get("source") == source
        and artifact.get("checkpoint_signature") == checkpoint_signature
        and artifact.get("checkpoint_key") == checkpoint_key_value
        and isinstance(artifact.get("response"), dict)
        and isinstance(artifact.get("summary"), dict)
        and is_embedding_summary_valid(artifact.get("embedding"))
        and is_window_embedding_summary_valid(artifact.get("window_embeddings"))
        and is_band_power_stats_summary_valid(artifact.get("band_power_stats"))
    )


def is_clustering_artifact_valid(
    artifact: dict[str, Any] | None,
    *,
    dataset_id: str,
    subject_id: str,
    model_name: str,
    source: TimeseriesSource,
    checkpoint_signature: str,
    checkpoint_key_value: str,
) -> bool:
    return bool(
        artifact
        and artifact.get("preprocessing_version") == PREPROCESSING_VERSION
        and artifact.get("dataset_id") == dataset_id
        and artifact.get("subject_id") == subject_id
        and artifact.get("model_name") == model_name
        and artifact.get("source") == source
        and artifact.get("checkpoint_signature") == checkpoint_signature
        and artifact.get("checkpoint_key") == checkpoint_key_value
        and is_window_embedding_cluster_summary_valid(artifact.get("window_embedding_clusters"))
    )


def is_embedding_summary_valid(embedding: Any) -> bool:
    return bool(
        isinstance(embedding, dict)
        and embedding.get("layer_name") == PENULTIMATE_EMBEDDING_LAYER
        and embedding.get("label") == PENULTIMATE_EMBEDDING_LABEL
        and isinstance(embedding.get("values"), list)
        and embedding.get("dimension") == len(embedding.get("values"))
        and len(embedding.get("values")) > 0
        and all(isinstance(value, (int, float)) and np.isfinite(value) for value in embedding.get("values"))
    )


def is_window_embedding_summary_valid(window_embeddings: Any) -> bool:
    if not (
        isinstance(window_embeddings, dict)
        and window_embeddings.get("layer_name") == PENULTIMATE_EMBEDDING_LAYER
        and window_embeddings.get("label") == PENULTIMATE_EMBEDDING_LABEL
        and isinstance(window_embeddings.get("values"), list)
        and isinstance(window_embeddings.get("dimension"), int)
        and window_embeddings.get("dimension") > 0
    ):
        return False

    dimension = window_embeddings["dimension"]
    return all(
        isinstance(row, list)
        and len(row) == dimension
        and all(isinstance(value, (int, float)) and np.isfinite(value) for value in row)
        for row in window_embeddings["values"]
    )


def is_window_embedding_cluster_summary_valid(window_embedding_clusters: Any) -> bool:
    return bool(
        isinstance(window_embedding_clusters, dict)
        and window_embedding_clusters.get("method") == WINDOW_EMBEDDING_CLUSTERING_METHOD
        and isinstance(window_embedding_clusters.get("labels"), list)
        and all(
            label is None or (isinstance(label, int) and label >= 0) for label in window_embedding_clusters["labels"]
        )
    )


def is_band_power_stats_summary_valid(band_power_stats: Any) -> bool:
    if not (
        isinstance(band_power_stats, dict)
        and band_power_stats.get("mode") == "intra_patient"
        and band_power_stats.get("unit_label") == "dB re channel total band power"
        and isinstance(band_power_stats.get("channels"), list)
        and len(band_power_stats["channels"]) == len(MODEL_CHANNELS)
    ):
        return False

    for channel, expected_channel_name in zip(band_power_stats["channels"], MODEL_CHANNELS, strict=True):
        if not (
            isinstance(channel, dict)
            and channel.get("channel") == expected_channel_name
            and isinstance(channel.get("bands"), list)
            and len(channel["bands"]) == len(MODEL_BANDS)
        ):
            return False
        for band, (expected_band_name, _start_hz, _end_hz) in zip(channel["bands"], MODEL_BANDS, strict=True):
            if not (
                isinstance(band, dict)
                and band.get("band") == expected_band_name
                and all(
                    isinstance(band.get(key), (int, float)) and np.isfinite(band.get(key))
                    for key in ("mean_db", "lower_2sigma_db", "upper_2sigma_db")
                )
                and isinstance(band.get("sample_count"), int)
                and band["sample_count"] >= 0
            ):
                return False

    return True
