from typing import Dict, List, Literal, Optional

from pydantic import BaseModel


TimeseriesSource = Literal["raw", "derivatives"]
TimeseriesBandFilter = Literal["delta", "theta", "alpha", "beta1", "beta2", "beta3", "gamma"]
TimeseriesSubjectSplit = Literal["train", "val", "test"]


class TimeseriesDatasetInfo(BaseModel):
    id: str
    name: Optional[str] = None
    subject_count: int
    sources: List[TimeseriesSource]


class TimeseriesDatasetListResponse(BaseModel):
    datasets: List[TimeseriesDatasetInfo]


class TimeseriesSubjectInfo(BaseModel):
    id: str
    sources: List[TimeseriesSource]
    subject_label: Optional[str] = None
    subject_split: Optional[TimeseriesSubjectSplit] = None


class TimeseriesSubjectListResponse(BaseModel):
    dataset_id: str
    subjects: List[TimeseriesSubjectInfo]


class TimeseriesChannelMetadata(BaseModel):
    name: str
    type: Optional[str] = None
    units: Optional[str] = None


class TimeseriesSubjectMetadata(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    sampling_frequency: float
    duration: float
    sample_count: int
    channel_count: int
    channels: List[TimeseriesChannelMetadata]
    raw_available: bool
    derivatives_available: bool
    subject_group: Optional[str] = None
    subject_label: Optional[str] = None
    task_name: Optional[str] = None
    recording_type: Optional[str] = None


class TimeseriesSignalResponse(BaseModel):
    dataset_id: str
    subject_id: str
    source: TimeseriesSource
    band_filter: Optional[TimeseriesBandFilter] = None
    preview: bool
    channels: List[str]
    sampling_frequency: float
    duration: float
    start_time: float
    end_time: float
    start_sample: int
    end_sample: int
    sample_count: int
    decimation: int
    samples: Dict[str, List[float]]
