from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field


class PatientAggregationSettings(BaseModel):
    strategy: Literal["disease_threshold"] = "disease_threshold"
    alzheimer_threshold: float = Field(ge=0.0, le=1.0)
    frontotemporal_dementia_threshold: float = Field(ge=0.0, le=1.0)


class PatientAggregationThresholdSetting(BaseModel):
    field: Literal["alzheimer_threshold", "frontotemporal_dementia_threshold"]
    class_label: str
    compact_label: str


class PatientAggregationSettingsResponse(PatientAggregationSettings):
    thresholds: List[PatientAggregationThresholdSetting]
    defaults: PatientAggregationSettings


__all__ = [
    "PatientAggregationSettings",
    "PatientAggregationSettingsResponse",
    "PatientAggregationThresholdSetting",
]
