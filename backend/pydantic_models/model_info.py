from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel

ModelMetadataValue = str | int | float | bool | List[str] | List[int] | List[float]


class ModelClassPresentation(BaseModel):
    class_id: int
    label: str
    compact_label: str


class ModelInfoResponse(BaseModel):
    name: str
    display_name: str
    architecture: str
    model_summary: str
    classes: List[ModelClassPresentation]
    metadata: Dict[str, ModelMetadataValue]
