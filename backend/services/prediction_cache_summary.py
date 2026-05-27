from __future__ import annotations

from backend.ml.model_vars import MODEL_CLASS_LABELS
from backend.pydantic_models.inference import ModelInferenceResponse
from backend.pydantic_models.prediction_cache import (
    ModelPredictionClassWindowCount,
    ModelPredictionSummary,
)
from backend.services.patient_aggregation_service import PatientAggregationService


def build_prediction_summary(*, response: ModelInferenceResponse, true_label: str | None) -> ModelPredictionSummary:
    class_counts = {class_id: 0 for class_id in MODEL_CLASS_LABELS}
    confidence_sum = 0.0
    for prediction in response.predictions:
        class_counts[prediction.predicted_class_id] = class_counts.get(prediction.predicted_class_id, 0) + 1
        confidence_sum += prediction.confidence

    total_windows = len(response.predictions)
    windows_per_class = [
        ModelPredictionClassWindowCount(
            class_id=class_id,
            class_label=class_label,
            count=class_counts.get(class_id, 0),
        )
        for class_id, class_label in MODEL_CLASS_LABELS.items()
    ]
    predicted_label = PatientAggregationService.aggregate_patient_prediction(windows_per_class, total_windows)
    mean_confidence = confidence_sum / total_windows if total_windows else None

    return ModelPredictionSummary(
        subject_id=response.subject_id,
        true_label=true_label,
        predicted_label=predicted_label,
        mean_confidence=mean_confidence,
        total_windows=total_windows,
        windows_per_class=windows_per_class,
    )
