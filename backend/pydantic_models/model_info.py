from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel

ModelMetadataValue = str | int | float | bool | List[str] | List[int] | List[float]


class ModelClassPresentation(BaseModel):
    class_id: int
    label: str
    compact_label: str


class ModelBandPresentation(BaseModel):
    band: str
    label: str
    start_hz: float
    end_hz: float


class ModelInfoResponse(BaseModel):
    name: str
    display_name: str
    architecture: str
    model_summary: str
    classes: List[ModelClassPresentation]
    bands: List[ModelBandPresentation]
    metadata: Dict[str, ModelMetadataValue]


class ModelListItem(BaseModel):
    name: str
    display_name: str
    architecture: str
    is_current: bool


class ModelListResponse(BaseModel):
    current_model_name: str
    models: List[ModelListItem]


class SetCurrentModelRequest(BaseModel):
    model_name: str
