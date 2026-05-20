from __future__ import annotations

from backend.config import CONFIG
from backend.ml.model_vars import MODEL_CLASS_LABELS
from backend.pydantic_models.inference import ModelInferenceResponse
from backend.pydantic_models.prediction_cache import (
    ModelPredictionClassWindowCount,
    ModelPredictionSummary,
)
from backend.services.model_errors import ModelServiceError


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
