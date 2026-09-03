from typing import Literal

from pydantic import BaseModel

TimeseriesSource = Literal["raw", "derivatives"]
TimeseriesBandFilter = Literal["delta", "theta", "alpha", "beta1", "beta2", "beta3", "gamma"]
TimeseriesSubjectSplit = Literal["train", "val", "test"]


class TimeseriesDatasetInfo(BaseModel):
    id: str
    name: str | None = None
    subject_count: int
    sources: list[TimeseriesSource]


class TimeseriesDatasetListResponse(BaseModel):
    datasets: list[TimeseriesDatasetInfo]


class TimeseriesSubjectInfo(BaseModel):
    id: str
    sources: list[TimeseriesSource]
    subject_label: str | None = None
    subject_split: TimeseriesSubjectSplit | None = None


class TimeseriesSubjectListResponse(BaseModel):
    dataset_id: str
    subjects: list[TimeseriesSubjectInfo]


class TimeseriesChannelMetadata(BaseModel):
    name: str
    type: str | None = None
    units: str | None = None


class TimeseriesSubjectMetadata(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    sampling_frequency: float
    duration: float
    sample_count: int
    channel_count: int
    channels: list[TimeseriesChannelMetadata]
    raw_available: bool
    derivatives_available: bool
    subject_group: str | None = None
    subject_label: str | None = None
    task_name: str | None = None
    recording_type: str | None = None


class TimeseriesSignalResponse(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    band_filter: TimeseriesBandFilter | None = None
    preview: bool
    channels: list[str]
    sampling_frequency: float
    duration: float
    start_time: float
    end_time: float
    start_sample: int
    end_sample: int
    sample_count: int
    decimation: int
    samples: dict[str, list[float]]
