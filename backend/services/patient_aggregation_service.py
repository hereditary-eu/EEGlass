from __future__ import annotations

from pathlib import Path

from pydantic import ValidationError

from backend.config import CONFIG
from backend.ml.model_vars import MODEL_CLASS_LABELS
from backend.pydantic_models.prediction_cache import (
    ModelPredictionClassWindowCount,
    ModelPredictionSummary,
)
from backend.pydantic_models.settings import PatientAggregationSettings
from backend.services.model_errors import ModelValidationError
from backend.services.prediction_cache_artifacts import read_json, write_json_atomic


HEALTHY_LABEL = "Healthy"
ALZHEIMER_LABEL = "Alzheimer Disease"
FTD_LABEL = "Frontotemporal Dementia"


class PatientAggregationService:
    @classmethod
    def default_settings(cls) -> PatientAggregationSettings:
        return PatientAggregationSettings(
            strategy="disease_threshold",
            alzheimer_threshold=CONFIG.MODEL_PATIENT_ALZHEIMER_WINDOW_THRESHOLD,
            frontotemporal_dementia_threshold=CONFIG.MODEL_PATIENT_FTD_WINDOW_THRESHOLD,
        )

    @classmethod
    def get_settings(cls) -> PatientAggregationSettings:
        payload = read_json(cls._settings_path())
        if payload is None:
            return cls.default_settings()

        try:
            return PatientAggregationSettings(**payload)
        except ValidationError:
            return cls.default_settings()

    @classmethod
    def save_settings(cls, settings: PatientAggregationSettings) -> PatientAggregationSettings:
        write_json_atomic(cls._settings_path(), settings.model_dump(mode="json"))
        return settings

    @classmethod
    def apply_to_summary(
        cls,
        summary: ModelPredictionSummary,
        settings: PatientAggregationSettings | None = None,
    ) -> ModelPredictionSummary:
        resolved_settings = settings or cls.get_settings()
        return summary.model_copy(
            update={
                "predicted_label": cls.aggregate_patient_prediction(
                    summary.windows_per_class,
                    summary.total_windows,
                    resolved_settings,
                )
            }
        )

    @classmethod
    def aggregate_patient_prediction(
        cls,
        windows_per_class: list[ModelPredictionClassWindowCount],
        total_windows: int,
        settings: PatientAggregationSettings | None = None,
    ) -> str | None:
        if total_windows <= 0:
            return None

        resolved_settings = settings or cls.get_settings()
        if resolved_settings.strategy != "disease_threshold":
            raise ModelValidationError(f"Unsupported patient aggregation strategy '{resolved_settings.strategy}'.")

        counts_by_label = {entry.class_label: entry.count for entry in windows_per_class}
        disease_candidates = [
            (ALZHEIMER_LABEL, counts_by_label.get(ALZHEIMER_LABEL, 0) / total_windows),
            (FTD_LABEL, counts_by_label.get(FTD_LABEL, 0) / total_windows),
        ]
        thresholds = {
            ALZHEIMER_LABEL: resolved_settings.alzheimer_threshold,
            FTD_LABEL: resolved_settings.frontotemporal_dementia_threshold,
        }
        passing_candidates = [
            (label, share) for label, share in disease_candidates if share >= thresholds[label]
        ]

        if not passing_candidates:
            return HEALTHY_LABEL

        class_order = {label: class_id for class_id, label in MODEL_CLASS_LABELS.items()}
        return max(
            passing_candidates,
            key=lambda candidate: (candidate[1], -class_order.get(candidate[0], 999)),
        )[0]

    @classmethod
    def _settings_path(cls) -> Path:
        return Path(CONFIG.MODEL_OUTPUT_STORAGE_DIR) / "settings" / "patient_aggregation.json"
