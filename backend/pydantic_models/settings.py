from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PatientAggregationSettings(BaseModel):
    strategy: Literal["disease_threshold"] = "disease_threshold"
    alzheimer_threshold: float = Field(ge=0.0, le=1.0)
    frontotemporal_dementia_threshold: float = Field(ge=0.0, le=1.0)


__all__ = ["PatientAggregationSettings"]
