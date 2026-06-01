from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel


FeatureImportanceMethod = Literal["shap"]
FeatureImportanceStatus = Literal["ok", "insufficient_data", "insufficient_classes"]
FeatureImportanceTargetColumn = Literal["true_label", "predicted_label"]


class ModelFeatureImportanceItem(BaseModel):
    feature: str
    importance: float


class ModelFeatureImportanceResponse(BaseModel):
    status: FeatureImportanceStatus
    method: FeatureImportanceMethod
    backend_model: str
    target_column: FeatureImportanceTargetColumn
    unit_label: str
    feature_importances: List[ModelFeatureImportanceItem]

