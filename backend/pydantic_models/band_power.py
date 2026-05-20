from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel

from backend.pydantic_models.timeseries import TimeseriesSource


class ModelBandPowerRequest(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource = "derivatives"
    window_index: int


class ModelBandPowerValue(BaseModel):
    band: str
    start_hz: float
    end_hz: float
    absolute_power: float
    relative_power: float


class ModelChannelBandPower(BaseModel):
    channel: str
    bands: List[ModelBandPowerValue]


class ModelBandPowerResponse(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    window_index: int
    start_time: float
    end_time: float
    sampling_frequency: float
    channels: List[ModelChannelBandPower]


class ModelBandPowerStatsValue(BaseModel):
    band: str
    start_hz: float
    end_hz: float
    mean_db: float
    lower_2sigma_db: float
    upper_2sigma_db: float
    sample_count: int


class ModelChannelBandPowerStats(BaseModel):
    channel: str
    bands: List[ModelBandPowerStatsValue]


class ModelBandPowerStatsResponse(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    mode: Literal["intra_patient", "inter_patient"]
    unit_label: str
    subject_count: int
    window_count: int
    channels: List[ModelChannelBandPowerStats]
