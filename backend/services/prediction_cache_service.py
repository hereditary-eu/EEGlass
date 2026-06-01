from __future__ import annotations

import asyncio
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import partial
from typing import Any, Literal

import numpy as np

from backend.config import CONFIG
from backend.ml.model_vars import DEFAULT_MODEL_NAME, get_embedding_feature_names
from backend.pydantic_models.inference import (
    ModelBandPowerStatsResponse,
    ModelInferenceResponse,
    ModelPatientEmbeddingPoint,
    ModelPatientEmbeddingReduction,
    ModelPatientEmbeddingsResponse,
    ModelPredictionCacheJobResponse,
    ModelPredictionCacheProgress,
    ModelPredictionCacheStatus,
    ModelPredictionSummary,
    ModelWindowEmbeddingPoint,
    ModelWindowEmbeddingsResponse,
)
from backend.pydantic_models.timeseries import TimeseriesSource
from backend.services.embedding_service import cluster_embeddings_density, reduce_embeddings_pca
from backend.services.prediction_cache_artifacts import (
    PENULTIMATE_EMBEDDING_LABEL,
    PENULTIMATE_EMBEDDING_LAYER,
    PREPROCESSING_VERSION,
    cache_dir,
    checkpoint_key,
    cleanup_stale_temp_files,
    is_clustering_artifact_valid,
    is_manifest_valid,
    is_model_artifact_valid,
    manifest_path,
    read_clustering_artifact,
    read_json,
    read_manifest,
    read_prediction_artifact,
    subject_clustering_path,
    subject_path,
    write_json_atomic,
)
from backend.services.prediction_cache_band_power import (
    build_inter_patient_band_power_stats_response,
    extract_band_power_mean_values,
)
from backend.services.prediction_cache_writers import write_clustering_artifact, write_prediction_artifact
from backend.services.patient_aggregation_service import PatientAggregationService
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

        aggregation_settings = PatientAggregationService.get_settings()
        valid_completed_subjects = []
        subject_summaries = []
        for subject in subjects:
            artifact = cls._read_prediction_artifact(dataset_id, model_name, checkpoint_key, subject.id, source)
            if not cls._is_model_artifact_valid(
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
            subject_summaries.append(
                PatientAggregationService.apply_to_summary(
                    ModelPredictionSummary(**artifact["summary"]),
                    aggregation_settings,
                )
            )
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

        aggregation_settings = PatientAggregationService.get_settings()
        summaries: list[ModelPredictionSummary] = []
        vectors: list[list[float]] = []
        source_dimension = 0

        for subject in subjects:
            artifact = cls._read_prediction_artifact(dataset_id, model_name, checkpoint_key, subject.id, source)
            if not cls._is_model_artifact_valid(
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

            summaries.append(
                PatientAggregationService.apply_to_summary(
                    ModelPredictionSummary(**artifact["summary"]),
                    aggregation_settings,
                )
            )
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
                raw_embedding=list(vector),
                true_label=summary.true_label,
                predicted_label=summary.predicted_label,
                mean_confidence=summary.mean_confidence,
                total_windows=summary.total_windows,
            )
            for summary, coordinate, vector in zip(summaries, coordinates, vectors, strict=True)
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
            for clustering_path in subjects_dir.glob(f"*.{source}.clusters.json"):
                clustering_path.unlink()

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
        if not cls._is_model_artifact_valid(
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
    def get_band_power_stats(
        cls,
        dataset_id: str,
        subject_id: str,
        model_name: str = DEFAULT_MODEL_NAME,
        source: TimeseriesSource = "derivatives",
        mode: Literal["intra_patient", "inter_patient"] = "intra_patient",
        cohort_label: str | None = None,
    ) -> ModelBandPowerStatsResponse:
        checkpoint_signature = ModelService.get_checkpoint_signature(model_name)
        checkpoint_key = cls._checkpoint_key(checkpoint_signature)
        subjects = cls._list_subjects(dataset_id)
        subject = next((candidate for candidate in subjects if candidate.id == subject_id), None)
        if subject is None:
            raise ModelNotFoundError(f"Subject '{subject_id}' was not found in dataset '{dataset_id}'.")

        if mode == "intra_patient":
            artifact = cls._read_prediction_artifact(dataset_id, model_name, checkpoint_key, subject_id, source)
            if not cls._is_model_artifact_valid(
                artifact,
                dataset_id=dataset_id,
                subject_id=subject_id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                checkpoint_key=checkpoint_key,
            ):
                raise ModelNotFoundError(
                    f"Band-power statistics for {dataset_id}/{subject_id} with model '{model_name}' were not found."
                )
            return ModelBandPowerStatsResponse(**artifact["band_power_stats"])

        manifest = cls._read_manifest(dataset_id, model_name, checkpoint_key, source)
        if not cls._is_manifest_valid(
            manifest,
            dataset_id,
            model_name,
            source,
            checkpoint_signature,
            checkpoint_key,
        ):
            raise ModelNotFoundError("Inter-patient band-power statistics require a completed dataset compute job.")

        completed_subjects = set(manifest.get("completed_subjects", []))
        available_subject_ids = [subject.id for subject in subjects if source in subject.sources]
        if not available_subject_ids or not set(available_subject_ids).issubset(completed_subjects):
            raise ModelNotFoundError("Inter-patient band-power statistics require a completed dataset compute job.")

        normalized_cohort_label = cohort_label.strip() if cohort_label else None
        patient_mean_values: list[np.ndarray] = []
        for cohort_subject_id in available_subject_ids:
            artifact = cls._read_prediction_artifact(dataset_id, model_name, checkpoint_key, cohort_subject_id, source)
            if not cls._is_model_artifact_valid(
                artifact,
                dataset_id=dataset_id,
                subject_id=cohort_subject_id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                checkpoint_key=checkpoint_key,
            ):
                raise ModelNotFoundError("Inter-patient band-power statistics require a completed dataset compute job.")

            if normalized_cohort_label:
                summary = ModelPredictionSummary(**artifact["summary"])
                if summary.true_label != normalized_cohort_label:
                    continue

            patient_mean_values.append(extract_band_power_mean_values(artifact["band_power_stats"]))

        return build_inter_patient_band_power_stats_response(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            cohort_label=normalized_cohort_label,
            patient_mean_values=patient_mean_values,
        )

    @classmethod
    def get_subject_window_embeddings(
        cls,
        dataset_id: str,
        subject_id: str,
        model_name: str = DEFAULT_MODEL_NAME,
        source: TimeseriesSource = "derivatives",
    ) -> ModelWindowEmbeddingsResponse:
        checkpoint_signature = ModelService.get_checkpoint_signature(model_name)
        checkpoint_key = cls._checkpoint_key(checkpoint_signature)
        artifact = cls._read_prediction_artifact(dataset_id, model_name, checkpoint_key, subject_id, source)
        if not cls._is_model_artifact_valid(
            artifact,
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key=checkpoint_key,
        ):
            inference_result = ModelService.infer_subject_with_embedding(
                dataset_id=dataset_id,
                subject_id=subject_id,
                source=source,
                model_name=model_name,
            )
            write_prediction_artifact(
                dataset_id=dataset_id,
                subject_id=subject_id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                checkpoint_key=checkpoint_key,
                response=inference_result.response,
                mean_penultimate_embedding=inference_result.mean_penultimate_embedding,
                penultimate_embeddings=inference_result.penultimate_embeddings,
            )
            artifact = cls._read_prediction_artifact(dataset_id, model_name, checkpoint_key, subject_id, source)

        clustering_artifact = cls._read_clustering_artifact(dataset_id, model_name, checkpoint_key, subject_id, source)
        return cls._subject_window_embeddings_response(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key=checkpoint_key,
            artifact=artifact,
            clustering_artifact=clustering_artifact,
        )

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
        write_prediction_artifact(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key=checkpoint_key,
            response=response,
            mean_penultimate_embedding=inference_result.mean_penultimate_embedding,
            penultimate_embeddings=inference_result.penultimate_embeddings,
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
                if cls._is_model_artifact_valid(
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
                    write_prediction_artifact(
                        dataset_id=job.dataset_id,
                        subject_id=subject.id,
                        model_name=job.model_name,
                        source=job.source,
                        checkpoint_signature=checkpoint_signature,
                        checkpoint_key=checkpoint_key,
                        response=response,
                        mean_penultimate_embedding=inference_result.mean_penultimate_embedding,
                        penultimate_embeddings=inference_result.penultimate_embeddings,
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
    def _subject_clustering_path(
        cls,
        dataset_id: str,
        model_name: str,
        checkpoint_key: str,
        subject_id: str,
        source: TimeseriesSource,
    ):
        return subject_clustering_path(dataset_id, model_name, checkpoint_key, subject_id, source)

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

    @classmethod
    def _read_clustering_artifact(
        cls,
        dataset_id: str,
        model_name: str,
        checkpoint_key: str,
        subject_id: str,
        source: TimeseriesSource,
    ) -> dict[str, Any] | None:
        return read_clustering_artifact(dataset_id, model_name, checkpoint_key, subject_id, source)

    @staticmethod
    def _read_json(path):
        return read_json(path)

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
            feature_names=get_embedding_feature_names(source_dimension),
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
    def _subject_window_embeddings_response(
        cls,
        *,
        dataset_id: str,
        subject_id: str,
        model_name: str,
        source: TimeseriesSource,
        checkpoint_signature: str,
        checkpoint_key: str,
        artifact: dict[str, Any] | None,
        clustering_artifact: dict[str, Any] | None,
    ) -> ModelWindowEmbeddingsResponse:
        if not artifact or not isinstance(artifact.get("response"), dict):
            return ModelWindowEmbeddingsResponse(
                dataset_id=dataset_id,
                subject_id=subject_id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                embedding_layer=PENULTIMATE_EMBEDDING_LAYER,
                embedding_label=PENULTIMATE_EMBEDDING_LABEL,
                feature_names=[],
                reduction=ModelPatientEmbeddingReduction(
                    method="pca",
                    status="insufficient_data",
                    source_dimension=0,
                    output_dimension=0,
                    explained_variance_ratio=[],
                ),
                points=[],
            )

        response = ModelInferenceResponse(**artifact["response"])
        embedding_rows = [
            [float(value) for value in row] for row in (artifact.get("window_embeddings", {}).get("values", []) or [])
        ]
        source_dimension = int(artifact.get("window_embeddings", {}).get("dimension", 0) or 0)
        cached_cluster_ids = (
            clustering_artifact.get("window_embedding_clusters", {}).get("labels", [])
            if is_clustering_artifact_valid(
                clustering_artifact,
                dataset_id=dataset_id,
                subject_id=subject_id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                checkpoint_key_value=checkpoint_key,
            )
            else []
        )

        if len(embedding_rows) < 2 or len(embedding_rows) != len(response.predictions):
            return ModelWindowEmbeddingsResponse(
                dataset_id=dataset_id,
                subject_id=subject_id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                embedding_layer=PENULTIMATE_EMBEDDING_LAYER,
                embedding_label=PENULTIMATE_EMBEDDING_LABEL,
                feature_names=get_embedding_feature_names(source_dimension),
                reduction=ModelPatientEmbeddingReduction(
                    method="pca",
                    status="insufficient_data",
                    source_dimension=source_dimension,
                    output_dimension=0,
                    explained_variance_ratio=[],
                ),
                points=[],
            )

        vectors = np.asarray(embedding_rows, dtype=float)
        coordinates, explained_variance_ratio, reduction_status = reduce_embeddings_pca(vectors)
        if len(cached_cluster_ids) == len(embedding_rows):
            cluster_ids = cached_cluster_ids
        else:
            cluster_ids = cluster_embeddings_density(vectors)
            write_clustering_artifact(
                dataset_id=dataset_id,
                subject_id=subject_id,
                model_name=model_name,
                source=source,
                checkpoint_signature=checkpoint_signature,
                checkpoint_key=checkpoint_key,
                cluster_labels=cluster_ids,
            )
        points = (
            [
                ModelWindowEmbeddingPoint(
                    window_index=prediction.window_index,
                    start_time=prediction.start_time,
                    end_time=prediction.end_time,
                    x=float(coordinate[0]),
                    y=float(coordinate[1]),
                    raw_embedding=[float(value) for value in embedding_row],
                    predicted_label=prediction.predicted_label,
                    confidence=prediction.confidence,
                    cluster_id=cluster_ids[index] if index < len(cluster_ids) else None,
                )
                for index, (prediction, coordinate, embedding_row) in enumerate(
                    zip(response.predictions, coordinates, embedding_rows, strict=True)
                )
            ]
            if reduction_status == "ok"
            else []
        )

        return ModelWindowEmbeddingsResponse(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            embedding_layer=PENULTIMATE_EMBEDDING_LAYER,
            embedding_label=PENULTIMATE_EMBEDDING_LABEL,
            feature_names=get_embedding_feature_names(source_dimension),
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
    def _is_model_artifact_valid(
        artifact: dict[str, Any] | None,
        *,
        dataset_id: str,
        subject_id: str,
        model_name: str,
        source: TimeseriesSource,
        checkpoint_signature: str,
        checkpoint_key: str,
    ) -> bool:
        return is_model_artifact_valid(
            artifact,
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key_value=checkpoint_key,
        )

    @staticmethod
    def _is_clustering_artifact_valid(
        artifact: dict[str, Any] | None,
        *,
        dataset_id: str,
        subject_id: str,
        model_name: str,
        source: TimeseriesSource,
        checkpoint_signature: str,
        checkpoint_key: str,
    ) -> bool:
        return is_clustering_artifact_valid(
            artifact,
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
            checkpoint_signature=checkpoint_signature,
            checkpoint_key_value=checkpoint_key,
        )
