from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import partial
from pathlib import Path
from typing import Any, Literal

import numpy as np

from backend.config import CONFIG
from backend.ml.model_registry import DEFAULT_MODEL_NAME
from backend.ml.model_vars import MODEL_CLASS_LABELS
from backend.pydantic_models.inference import (
    ModelInferenceResponse,
    ModelPatientEmbeddingPoint,
    ModelPatientEmbeddingReduction,
    ModelPatientEmbeddingsResponse,
    ModelPredictionClassWindowCount,
    ModelPredictionCacheJobResponse,
    ModelPredictionCacheProgress,
    ModelPredictionCacheStatus,
    ModelPredictionSummary,
)
from backend.pydantic_models.timeseries import TimeseriesSource
from backend.services.model_service import (
    ModelNotFoundError,
    ModelService,
    ModelServiceError,
    ModelValidationError,
)
from backend.services.timeseries_service import (
    TimeseriesNotFoundError,
    TimeseriesService,
    TimeseriesServiceError,
    TimeseriesValidationError,
)

PREPROCESSING_VERSION = "xeegnet-preprocessing-v2-penultimate-embedding"
PENULTIMATE_EMBEDDING_LAYER = "encoder"
PENULTIMATE_EMBEDDING_LABEL = "penultimate embedding"


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


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except OSError, json.JSONDecodeError:
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


def is_artifact_valid(
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


def reduce_embeddings_pca(vectors: np.ndarray) -> tuple[np.ndarray, list[float], str]:
    if vectors.ndim != 2 or vectors.shape[0] < 2:
        return np.empty((0, 2), dtype=float), [], "insufficient_data"

    vectors = vectors.astype(float, copy=False)
    source_dimension = vectors.shape[1]
    centered = vectors - np.mean(vectors, axis=0, keepdims=True)

    if source_dimension == 1:
        coordinates = np.column_stack([centered[:, 0], np.zeros(centered.shape[0], dtype=float)])
        variance = float(np.var(centered[:, 0], ddof=1)) if centered.shape[0] > 1 else 0.0
        ratio = [1.0 if variance > 0 else 0.0, 0.0]
        return coordinates, ratio, "ok"

    _u, singular_values, components = np.linalg.svd(centered, full_matrices=False)
    output_components = components[:2]
    coordinates = centered @ output_components.T
    if coordinates.shape[1] == 1:
        coordinates = np.column_stack([coordinates[:, 0], np.zeros(coordinates.shape[0], dtype=float)])

    variances = (singular_values**2) / max(vectors.shape[0] - 1, 1)
    total_variance = float(np.sum(variances))
    if total_variance > 0:
        explained = (variances[:2] / total_variance).astype(float).tolist()
    else:
        explained = []
    explained = (explained + [0.0, 0.0])[:2]
    return coordinates[:, :2].astype(float, copy=False), explained, "ok"


def build_prediction_summary(*, response: ModelInferenceResponse, true_label: str | None) -> ModelPredictionSummary:
    class_counts = {class_id: 0 for class_id in MODEL_CLASS_LABELS}
    confidence_sum = 0.0
    for prediction in response.predictions:
        class_counts[prediction.predicted_class_id] = class_counts.get(prediction.predicted_class_id, 0) + 1
        confidence_sum += prediction.confidence

    total_windows = len(response.predictions)
    predicted_label = aggregate_patient_prediction(class_counts, total_windows)
    mean_confidence = confidence_sum / total_windows if total_windows else None

    return ModelPredictionSummary(
        subject_id=response.subject_id,
        true_label=true_label,
        predicted_label=predicted_label,
        mean_confidence=mean_confidence,
        total_windows=total_windows,
        windows_per_class=[
            ModelPredictionClassWindowCount(
                class_id=class_id,
                class_label=class_label,
                count=class_counts.get(class_id, 0),
            )
            for class_id, class_label in MODEL_CLASS_LABELS.items()
        ],
    )


def aggregate_patient_prediction(class_counts: dict[int, int], total_windows: int) -> str | None:
    if total_windows <= 0:
        return None

    strategy = CONFIG.MODEL_PATIENT_AGGREGATION_STRATEGY
    if strategy == "majority_vote":
        predicted_class_id = max(class_counts, key=lambda class_id: (class_counts[class_id], -class_id))
        return MODEL_CLASS_LABELS[predicted_class_id]

    raise ModelServiceError(f"Unsupported patient aggregation strategy '{strategy}'.")


@dataclass
class _PredictionCacheJob:
    job_id: str
    dataset_id: str
    model_name: str
    source: TimeseriesSource
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    done: int = 0
    total: int = 0
    failed: int = 0
    current_subject_id: str | None = None
    message: str = "Queued"
    task: asyncio.Task | None = None


class PredictionCacheService:
    _jobs: dict[str, _PredictionCacheJob] = {}
    _prediction_executor: ThreadPoolExecutor | None = None

    @classmethod
    def start_dataset_job(
        cls,
        dataset_id: str,
        model_name: str = DEFAULT_MODEL_NAME,
        source: TimeseriesSource = "derivatives",
    ) -> ModelPredictionCacheJobResponse:
        # Validate model/checkpoint before creating a job.
        ModelService.get_checkpoint_signature(model_name)
        cls._list_subjects(dataset_id)
        if cls._has_running_job(dataset_id=dataset_id, model_name=model_name, source=source):
            raise ModelValidationError("A prediction cache job is already running for this dataset.")

        job_id = uuid.uuid4().hex
        job = _PredictionCacheJob(job_id=job_id, dataset_id=dataset_id, model_name=model_name, source=source)
        cls._jobs[job_id] = job
        job.task = asyncio.create_task(cls._run_dataset_job(job))

        return ModelPredictionCacheJobResponse(
            job_id=job.job_id,
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
            status=job.status,
        )

    @classmethod
    def get_active_job_progress(
        cls,
        dataset_id: str,
        model_name: str = DEFAULT_MODEL_NAME,
        source: TimeseriesSource = "derivatives",
    ) -> ModelPredictionCacheProgress | None:
        active_job = next(
            (
                job
                for job in cls._jobs.values()
                if job.dataset_id == dataset_id
                and job.model_name == model_name
                and job.source == source
                and job.status in ("queued", "running")
            ),
            None,
        )
        return cls._progress(active_job) if active_job else None

    @classmethod
    async def watch_job(cls, job_id: str):
        last_payload: dict[str, Any] | None = None
        while True:
            job = cls._jobs.get(job_id)
            if job is None:
                yield {
                    "job_id": job_id,
                    "status": "failed",
                    "done": 0,
                    "total": 0,
                    "failed": 1,
                    "message": "Prediction cache job was not found.",
                }
                return

            payload = cls._progress(job).model_dump(mode="json")
            if payload != last_payload:
                yield payload
                last_payload = payload

            if job.status in ("completed", "failed"):
                return

            await asyncio.sleep(0.35)

    @classmethod
    def get_cache_status(
        cls,
        dataset_id: str,
        model_name: str = DEFAULT_MODEL_NAME,
        source: TimeseriesSource = "derivatives",
    ) -> ModelPredictionCacheStatus:
        checkpoint_signature = ModelService.get_checkpoint_signature(model_name)
        checkpoint_key = cls._checkpoint_key(checkpoint_signature)
        cls._cleanup_stale_temp_files(cls._cache_dir(dataset_id, model_name, checkpoint_key))
        subjects = cls._list_subjects(dataset_id)
        manifest = cls._read_manifest(dataset_id, model_name, checkpoint_key, source)
        completed_subjects = set()
        failed_subjects = {}

        if cls._is_manifest_valid(manifest, dataset_id, model_name, source, checkpoint_signature, checkpoint_key):
            completed_subjects = set(manifest.get("completed_subjects", []))
            failed_subjects = dict(manifest.get("failed_subjects", {}))

        valid_completed_subjects = []
        subject_summaries = []
        for subject in subjects:
            artifact = cls._read_prediction_artifact(dataset_id, model_name, checkpoint_key, subject.id, source)
            if not cls._is_artifact_valid(
                artifact,
                dataset_id=dataset_id,
                subject_id=subject.id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                checkpoint_key=checkpoint_key,
            ):
                continue

            if subject.id in completed_subjects:
                valid_completed_subjects.append(subject.id)
            subject_summaries.append(ModelPredictionSummary(**artifact["summary"]))
        status: Literal["missing", "partial", "complete"] = "missing"
        if valid_completed_subjects or failed_subjects:
            status = "partial"
        if subjects and len(valid_completed_subjects) == len(subjects):
            status = "complete"

        return ModelPredictionCacheStatus(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key=checkpoint_key,
            preprocessing_version=PREPROCESSING_VERSION,
            status=status,
            total_subjects=len(subjects),
            completed_subjects=len(valid_completed_subjects),
            failed_subjects=len(failed_subjects),
            subject_summaries=subject_summaries,
            manifest_path=str(cls._manifest_path(dataset_id, model_name, checkpoint_key, source)),
            updated_at=manifest.get("updated_at") if isinstance(manifest, dict) else None,
        )

    @classmethod
    def get_patient_embeddings(
        cls,
        dataset_id: str,
        model_name: str = DEFAULT_MODEL_NAME,
        source: TimeseriesSource = "derivatives",
    ) -> ModelPatientEmbeddingsResponse:
        checkpoint_signature = ModelService.get_checkpoint_signature(model_name)
        checkpoint_key = cls._checkpoint_key(checkpoint_signature)
        subjects = cls._list_subjects(dataset_id)

        summaries: list[ModelPredictionSummary] = []
        vectors: list[list[float]] = []
        source_dimension = 0

        for subject in subjects:
            artifact = cls._read_prediction_artifact(dataset_id, model_name, checkpoint_key, subject.id, source)
            if not cls._is_artifact_valid(
                artifact,
                dataset_id=dataset_id,
                subject_id=subject.id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                checkpoint_key=checkpoint_key,
            ):
                continue

            embedding_values = [float(value) for value in artifact["embedding"]["values"]]
            if source_dimension == 0:
                source_dimension = len(embedding_values)
            if len(embedding_values) != source_dimension:
                continue

            summaries.append(ModelPredictionSummary(**artifact["summary"]))
            vectors.append(embedding_values)

        if len(vectors) < 2:
            return cls._patient_embeddings_response(
                dataset_id=dataset_id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                checkpoint_key=checkpoint_key,
                source_dimension=source_dimension,
                reduction_status="insufficient_data",
                explained_variance_ratio=[],
                points=[],
            )

        coordinates, explained_variance_ratio, reduction_status = reduce_embeddings_pca(
            np.asarray(vectors, dtype=float)
        )
        points = [
            ModelPatientEmbeddingPoint(
                subject_id=summary.subject_id,
                x=float(coordinate[0]),
                y=float(coordinate[1]),
                true_label=summary.true_label,
                predicted_label=summary.predicted_label,
                mean_confidence=summary.mean_confidence,
                total_windows=summary.total_windows,
            )
            for summary, coordinate in zip(summaries, coordinates, strict=True)
        ]

        return cls._patient_embeddings_response(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key=checkpoint_key,
            source_dimension=source_dimension,
            reduction_status=reduction_status,
            explained_variance_ratio=explained_variance_ratio,
            points=points,
        )

    @classmethod
    def delete_cache(
        cls,
        dataset_id: str,
        model_name: str = DEFAULT_MODEL_NAME,
        source: TimeseriesSource = "derivatives",
    ) -> ModelPredictionCacheStatus:
        checkpoint_signature = ModelService.get_checkpoint_signature(model_name)
        checkpoint_key = cls._checkpoint_key(checkpoint_signature)
        cls._list_subjects(dataset_id)
        cls._cleanup_stale_temp_files(cls._cache_dir(dataset_id, model_name, checkpoint_key))

        if cls._has_running_job(dataset_id=dataset_id, model_name=model_name, source=source):
            raise ModelValidationError("Prediction cache cannot be deleted while a compute job is running.")

        manifest_path = cls._manifest_path(dataset_id, model_name, checkpoint_key, source)
        if manifest_path.is_file():
            manifest_path.unlink()

        subjects_dir = cls._cache_dir(dataset_id, model_name, checkpoint_key) / "subjects"
        if subjects_dir.is_dir():
            for prediction_path in subjects_dir.glob(f"*.{source}.predictions.json"):
                prediction_path.unlink()

        return cls.get_cache_status(dataset_id=dataset_id, model_name=model_name, source=source)

    @classmethod
    def get_subject_predictions(
        cls,
        dataset_id: str,
        subject_id: str,
        model_name: str = DEFAULT_MODEL_NAME,
        source: TimeseriesSource = "derivatives",
    ) -> ModelInferenceResponse:
        checkpoint_signature = ModelService.get_checkpoint_signature(model_name)
        checkpoint_key = cls._checkpoint_key(checkpoint_signature)
        subjects = cls._list_subjects(dataset_id)
        if not any(subject.id == subject_id for subject in subjects):
            raise ModelNotFoundError(f"Subject '{subject_id}' was not found in dataset '{dataset_id}'.")

        artifact = cls._read_prediction_artifact(dataset_id, model_name, checkpoint_key, subject_id, source)
        if not cls._is_artifact_valid(
            artifact,
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key=checkpoint_key,
        ):
            raise ModelNotFoundError(
                f"Cached predictions for {dataset_id}/{subject_id} with model '{model_name}' were not found."
            )

        return ModelInferenceResponse(**artifact["response"])

    @classmethod
    async def compute_subject_predictions(
        cls,
        dataset_id: str,
        subject_id: str,
        model_name: str = DEFAULT_MODEL_NAME,
        source: TimeseriesSource = "derivatives",
    ) -> ModelInferenceResponse:
        checkpoint_signature = ModelService.get_checkpoint_signature(model_name)
        checkpoint_key = cls._checkpoint_key(checkpoint_signature)
        subjects = cls._list_subjects(dataset_id)
        subject = next((candidate for candidate in subjects if candidate.id == subject_id), None)
        if subject is None:
            raise ModelNotFoundError(f"Subject '{subject_id}' was not found in dataset '{dataset_id}'.")
        if source not in subject.sources:
            raise ModelValidationError(f"Source '{source}' is not available for subject '{subject_id}'.")
        if cls._has_running_job(dataset_id=dataset_id, model_name=model_name, source=source):
            raise ModelValidationError("Predictions cannot be computed while a dataset-level compute job is running.")

        loop = asyncio.get_running_loop()
        inference_result = await loop.run_in_executor(
            cls._executor(),
            partial(
                ModelService.infer_subject_with_embedding,
                dataset_id=dataset_id,
                subject_id=subject_id,
                source=source,
                model_name=model_name,
            ),
        )
        response = inference_result.response
        cls._write_prediction_artifact(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key=checkpoint_key,
            response=response,
            mean_penultimate_embedding=inference_result.mean_penultimate_embedding,
        )
        cls._mark_subject_completed(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key=checkpoint_key,
        )
        return response

    @classmethod
    async def _run_dataset_job(cls, job: _PredictionCacheJob) -> None:
        try:
            checkpoint_signature = ModelService.get_checkpoint_signature(job.model_name)
            checkpoint_key = cls._checkpoint_key(checkpoint_signature)
            subjects = cls._list_subjects(job.dataset_id)
            job.total = len(subjects)
            job.status = "running"
            job.message = "Starting predictions"
            await asyncio.sleep(0)

            manifest = cls._base_manifest(
                job.dataset_id, job.model_name, job.source, checkpoint_signature, checkpoint_key
            )
            existing_manifest = cls._read_manifest(job.dataset_id, job.model_name, checkpoint_key, job.source)
            if cls._is_manifest_valid(
                existing_manifest,
                job.dataset_id,
                job.model_name,
                job.source,
                checkpoint_signature,
                checkpoint_key,
            ):
                manifest["completed_subjects"] = list(existing_manifest.get("completed_subjects", []))
                manifest["failed_subjects"] = dict(existing_manifest.get("failed_subjects", {}))

            completed_subjects = set(manifest["completed_subjects"])
            failed_subjects: dict[str, str] = dict(manifest["failed_subjects"])

            for subject in subjects:
                job.current_subject_id = subject.id
                if job.source not in subject.sources:
                    failed_subjects[subject.id] = f"Source '{job.source}' is not available."
                    job.failed = len(failed_subjects)
                    job.done += 1
                    job.message = f"Skipping {subject.id}: source unavailable"
                    cls._update_manifest(manifest, completed_subjects, failed_subjects, "running")
                    cls._write_manifest(manifest, job.dataset_id, job.model_name, checkpoint_key, job.source)
                    continue

                cached = cls._read_prediction_artifact(
                    job.dataset_id, job.model_name, checkpoint_key, subject.id, job.source
                )
                if cls._is_artifact_valid(
                    cached,
                    dataset_id=job.dataset_id,
                    subject_id=subject.id,
                    model_name=job.model_name,
                    source=job.source,
                    checkpoint_signature=checkpoint_signature,
                    checkpoint_key=checkpoint_key,
                ):
                    completed_subjects.add(subject.id)
                    failed_subjects.pop(subject.id, None)
                    job.done += 1
                    job.message = f"Skipping cached {subject.id}"
                    cls._update_manifest(manifest, completed_subjects, failed_subjects, "running")
                    cls._write_manifest(manifest, job.dataset_id, job.model_name, checkpoint_key, job.source)
                    continue

                try:
                    job.message = f"Predicting {subject.id}"
                    loop = asyncio.get_running_loop()
                    inference_result = await loop.run_in_executor(
                        cls._executor(),
                        partial(
                            ModelService.infer_subject_with_embedding,
                            dataset_id=job.dataset_id,
                            subject_id=subject.id,
                            source=job.source,
                            model_name=job.model_name,
                        ),
                    )
                    response = inference_result.response
                    cls._write_prediction_artifact(
                        dataset_id=job.dataset_id,
                        subject_id=subject.id,
                        model_name=job.model_name,
                        source=job.source,
                        checkpoint_signature=checkpoint_signature,
                        checkpoint_key=checkpoint_key,
                        response=response,
                        mean_penultimate_embedding=inference_result.mean_penultimate_embedding,
                    )
                    completed_subjects.add(subject.id)
                    failed_subjects.pop(subject.id, None)
                except Exception as exc:  # noqa: BLE001 - job records per-subject failures and continues.
                    failed_subjects[subject.id] = str(exc)

                job.done += 1
                job.failed = len(failed_subjects)
                cls._update_manifest(manifest, completed_subjects, failed_subjects, "running")
                cls._write_manifest(manifest, job.dataset_id, job.model_name, checkpoint_key, job.source)

            job.status = "completed"
            job.current_subject_id = None
            job.failed = len(failed_subjects)
            job.message = "Prediction cache complete"
            cls._update_manifest(manifest, completed_subjects, failed_subjects, "complete")
            cls._write_manifest(manifest, job.dataset_id, job.model_name, checkpoint_key, job.source)
        except Exception as exc:  # noqa: BLE001 - job status must surface failures to the UI.
            job.status = "failed"
            job.message = str(exc)

    @staticmethod
    def _list_subjects(dataset_id: str):
        try:
            return TimeseriesService.list_subjects(dataset_id)
        except TimeseriesNotFoundError as exc:
            raise ModelNotFoundError(str(exc)) from exc
        except TimeseriesValidationError as exc:
            raise ModelValidationError(str(exc)) from exc
        except TimeseriesServiceError as exc:
            raise ModelServiceError(str(exc)) from exc

    @classmethod
    def _executor(cls) -> ThreadPoolExecutor:
        if cls._prediction_executor is None:
            cls._prediction_executor = ThreadPoolExecutor(
                max_workers=max(1, CONFIG.MODEL_PREDICTION_WORKERS),
                thread_name_prefix="prediction-cache",
            )
        return cls._prediction_executor

    @classmethod
    def _has_running_job(cls, *, dataset_id: str, model_name: str, source: TimeseriesSource) -> bool:
        return any(
            job.dataset_id == dataset_id
            and job.model_name == model_name
            and job.source == source
            and job.status in ("queued", "running")
            for job in cls._jobs.values()
        )

    @classmethod
    def _progress(cls, job: _PredictionCacheJob) -> ModelPredictionCacheProgress:
        return ModelPredictionCacheProgress(
            job_id=job.job_id,
            dataset_id=job.dataset_id,
            model_name=job.model_name,
            source=job.source,
            status=job.status,
            done=job.done,
            total=job.total,
            failed=job.failed,
            current_subject_id=job.current_subject_id,
            message=job.message,
        )

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _checkpoint_key(checkpoint_signature: str) -> str:
        return checkpoint_key(checkpoint_signature)

    @classmethod
    def _cache_dir(cls, dataset_id: str, model_name: str, checkpoint_key: str):
        return cache_dir(dataset_id, model_name, checkpoint_key)

    @classmethod
    def _manifest_path(cls, dataset_id: str, model_name: str, checkpoint_key: str, source: TimeseriesSource):
        return manifest_path(dataset_id, model_name, checkpoint_key, source)

    @classmethod
    def _subject_path(
        cls,
        dataset_id: str,
        model_name: str,
        checkpoint_key: str,
        subject_id: str,
        source: TimeseriesSource,
    ):
        return subject_path(dataset_id, model_name, checkpoint_key, subject_id, source)

    @classmethod
    def _read_manifest(
        cls,
        dataset_id: str,
        model_name: str,
        checkpoint_key: str,
        source: TimeseriesSource,
    ) -> dict[str, Any]:
        return read_manifest(dataset_id, model_name, checkpoint_key, source)

    @classmethod
    def _read_prediction_artifact(
        cls,
        dataset_id: str,
        model_name: str,
        checkpoint_key: str,
        subject_id: str,
        source: TimeseriesSource,
    ) -> dict[str, Any] | None:
        return read_prediction_artifact(dataset_id, model_name, checkpoint_key, subject_id, source)

    @staticmethod
    def _read_json(path):
        return read_json(path)

    @classmethod
    def _write_prediction_artifact(
        cls,
        *,
        dataset_id: str,
        subject_id: str,
        model_name: str,
        source: TimeseriesSource,
        checkpoint_signature: str,
        checkpoint_key: str,
        response: ModelInferenceResponse,
        mean_penultimate_embedding: list[float],
    ) -> None:
        embedding_values = [float(value) for value in mean_penultimate_embedding]
        artifact = {
            "preprocessing_version": PREPROCESSING_VERSION,
            "model_name": model_name,
            "checkpoint_signature": checkpoint_signature,
            "checkpoint_key": checkpoint_key,
            "dataset_id": dataset_id,
            "subject_id": subject_id,
            "source": source,
            "created_at": cls._now(),
            "summary": cls._build_prediction_summary(
                response=response,
                true_label=cls._get_subject_label(dataset_id, subject_id),
            ).model_dump(mode="json"),
            "embedding": {
                "layer_name": PENULTIMATE_EMBEDDING_LAYER,
                "label": PENULTIMATE_EMBEDDING_LABEL,
                "dimension": len(embedding_values),
                "values": embedding_values,
            },
            "response": response.model_dump(mode="json"),
        }
        cls._write_json_atomic(cls._subject_path(dataset_id, model_name, checkpoint_key, subject_id, source), artifact)

    @classmethod
    def _build_prediction_summary(
        cls,
        *,
        response: ModelInferenceResponse,
        true_label: str | None,
    ) -> ModelPredictionSummary:
        return build_prediction_summary(response=response, true_label=true_label)

    @staticmethod
    def _get_subject_label(dataset_id: str, subject_id: str) -> str | None:
        try:
            return TimeseriesService.get_subject_label(dataset_id, subject_id)
        except TimeseriesServiceError:
            return None

    @staticmethod
    def _patient_embeddings_response(
        *,
        dataset_id: str,
        model_name: str,
        source: TimeseriesSource,
        checkpoint_signature: str,
        checkpoint_key: str,
        source_dimension: int,
        reduction_status: Literal["ok", "insufficient_data"],
        explained_variance_ratio: list[float],
        points: list[ModelPatientEmbeddingPoint],
    ) -> ModelPatientEmbeddingsResponse:
        return ModelPatientEmbeddingsResponse(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key=checkpoint_key,
            preprocessing_version=PREPROCESSING_VERSION,
            embedding_layer=PENULTIMATE_EMBEDDING_LAYER,
            embedding_label=PENULTIMATE_EMBEDDING_LABEL,
            reduction=ModelPatientEmbeddingReduction(
                method="pca",
                status=reduction_status,
                source_dimension=source_dimension,
                output_dimension=2 if reduction_status == "ok" else 0,
                explained_variance_ratio=explained_variance_ratio,
            ),
            points=points,
        )

    @classmethod
    def _write_manifest(
        cls,
        manifest: dict[str, Any],
        dataset_id: str,
        model_name: str,
        checkpoint_key: str,
        source: TimeseriesSource,
    ) -> None:
        manifest["updated_at"] = cls._now()
        cls._write_json_atomic(cls._manifest_path(dataset_id, model_name, checkpoint_key, source), manifest)

    @classmethod
    def _mark_subject_completed(
        cls,
        *,
        dataset_id: str,
        subject_id: str,
        model_name: str,
        source: TimeseriesSource,
        checkpoint_signature: str,
        checkpoint_key: str,
    ) -> None:
        manifest = cls._base_manifest(dataset_id, model_name, source, checkpoint_signature, checkpoint_key)
        existing_manifest = cls._read_manifest(dataset_id, model_name, checkpoint_key, source)
        if cls._is_manifest_valid(
            existing_manifest, dataset_id, model_name, source, checkpoint_signature, checkpoint_key
        ):
            manifest["completed_subjects"] = list(existing_manifest.get("completed_subjects", []))
            manifest["failed_subjects"] = dict(existing_manifest.get("failed_subjects", {}))

        completed_subjects = set(manifest["completed_subjects"])
        failed_subjects: dict[str, str] = dict(manifest["failed_subjects"])
        completed_subjects.add(subject_id)
        failed_subjects.pop(subject_id, None)
        cls._update_manifest(manifest, completed_subjects, failed_subjects, "partial")
        cls._write_manifest(manifest, dataset_id, model_name, checkpoint_key, source)

    @staticmethod
    def _write_json_atomic(path, payload: dict[str, Any]) -> None:
        write_json_atomic(path, payload)

    @staticmethod
    def _cleanup_stale_temp_files(cache_dir) -> None:
        cleanup_stale_temp_files(cache_dir)

    @classmethod
    def _base_manifest(
        cls,
        dataset_id: str,
        model_name: str,
        source: TimeseriesSource,
        checkpoint_signature: str,
        checkpoint_key: str,
    ) -> dict[str, Any]:
        now = cls._now()
        return {
            "preprocessing_version": PREPROCESSING_VERSION,
            "model_name": model_name,
            "checkpoint_signature": checkpoint_signature,
            "checkpoint_key": checkpoint_key,
            "dataset_id": dataset_id,
            "source": source,
            "status": "running",
            "created_at": now,
            "updated_at": now,
            "completed_subjects": [],
            "failed_subjects": {},
        }

    @staticmethod
    def _update_manifest(
        manifest: dict[str, Any],
        completed_subjects: set[str],
        failed_subjects: dict[str, str],
        status: str,
    ) -> None:
        manifest["completed_subjects"] = sorted(completed_subjects)
        manifest["failed_subjects"] = dict(sorted(failed_subjects.items()))
        manifest["status"] = status

    @staticmethod
    def _is_manifest_valid(
        manifest: dict[str, Any] | None,
        dataset_id: str,
        model_name: str,
        source: TimeseriesSource,
        checkpoint_signature: str,
        checkpoint_key: str,
    ) -> bool:
        return is_manifest_valid(manifest, dataset_id, model_name, source, checkpoint_signature, checkpoint_key)

    @staticmethod
    def _is_artifact_valid(
        artifact: dict[str, Any] | None,
        *,
        dataset_id: str,
        subject_id: str,
        model_name: str,
        source: TimeseriesSource,
        checkpoint_signature: str,
        checkpoint_key: str,
    ) -> bool:
        return is_artifact_valid(
            artifact,
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key_value=checkpoint_key,
        )
