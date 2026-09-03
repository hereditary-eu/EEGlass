from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from backend.pydantic_models.timeseries import TimeseriesSource


class ModelScalpTopologyChannel(BaseModel):
    name: str
    x: float
    y: float
    weight: float


class ModelScalpTopologyBand(BaseModel):
    band: str
    channels: list[ModelScalpTopologyChannel]
    grid_values: list[float]


class ModelScalpTopologyGrid(BaseModel):
    resolution: int
    x: list[float]
    y: list[float]


class ModelScalpTopologyResponse(BaseModel):
    layer_name: str
    unit_label: str
    global_min_weight: float
    global_max_weight: float
    grid: ModelScalpTopologyGrid
    bands: list[ModelScalpTopologyBand]


class ModelWindowScalpTopologyChannel(BaseModel):
    name: str
    x: float
    y: float
    value: float


class ModelWindowScalpTopologyBand(BaseModel):
    band: str
    channels: list[ModelWindowScalpTopologyChannel]
    grid_values: list[float]


class ModelWindowScalpTopologyMode(BaseModel):
    mode: Literal["weighted_contribution", "input_power"]
    label: str
    unit_label: str
    color_scale: Literal["diverging", "sequential"]
    global_min_value: float
    global_max_value: float
    bands: list[ModelWindowScalpTopologyBand]


class ModelWindowScalpTopologyResponse(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    model_name: str
    checkpoint_signature: str
    window_index: int
    start_time: float
    end_time: float
    layer_name: str
    grid: ModelScalpTopologyGrid
    modes: list[ModelWindowScalpTopologyMode]
