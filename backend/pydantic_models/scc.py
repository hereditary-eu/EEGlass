from typing import Literal

from pydantic import BaseModel


class SCCBandValue(BaseModel):
    band: str
    start_hz: float
    end_hz: float
    mean_coherence: float


class SCCChannel(BaseModel):
    channel: str
    bands: list[SCCBandValue]


class SCCResponse(BaseModel):
    dataset_id: str
    subject_id: str
    window_index: int
    start_time: float
    end_time: float
    unit_label: str = "mean coherence"
    channels: list[SCCChannel]


class SCCBandStats(BaseModel):
    band: str
    start_hz: float
    end_hz: float
    mean: float
    lower_2sigma: float
    upper_2sigma: float
    sample_count: int


class SCCChannelStats(BaseModel):
    channel: str
    bands: list[SCCBandStats]


class SCCStatsResponse(BaseModel):
    dataset_id: str
    subject_id: str
    mode: Literal["intra_patient", "inter_patient"]
    cohort_label: str | None = None
    unit_label: str = "mean coherence"
    subject_count: int
    window_count: int
    channels: list[SCCChannelStats]
