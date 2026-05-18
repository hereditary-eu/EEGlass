from typing import cast

from fastapi import APIRouter, HTTPException, Query

from backend.pydantic_models.timeseries import (
    TimeseriesBandFilter,
    TimeseriesDatasetListResponse,
    TimeseriesSignalResponse,
    TimeseriesSource,
    TimeseriesSubjectListResponse,
    TimeseriesSubjectMetadata,
)
from backend.services.timeseries_service import (
    TimeseriesNotFoundError,
    TimeseriesReaderUnavailableError,
    TimeseriesService,
    TimeseriesServiceError,
    TimeseriesValidationError,
)
from backend.utils.logger import get_logger

logger = get_logger(__name__)
timeseries_router = APIRouter(prefix="/data", tags=["data"])


@timeseries_router.get("/datasets", response_model=TimeseriesDatasetListResponse)
async def list_timeseries_datasets() -> TimeseriesDatasetListResponse:
    return TimeseriesDatasetListResponse(datasets=TimeseriesService.list_datasets())


@timeseries_router.get("/datasets/{dataset_id}/subjects", response_model=TimeseriesSubjectListResponse)
async def list_timeseries_subjects(dataset_id: str) -> TimeseriesSubjectListResponse:
    try:
        return TimeseriesSubjectListResponse(
            dataset_id=dataset_id,
            subjects=TimeseriesService.list_subjects(dataset_id),
        )
    except TimeseriesServiceError as exc:
        raise _http_error(exc) from exc


@timeseries_router.get(
    "/datasets/{dataset_id}/subjects/{subject_id}/metadata", response_model=TimeseriesSubjectMetadata
)
async def get_timeseries_subject_metadata(
    dataset_id: str,
    subject_id: str,
    source: str = Query("derivatives"),
) -> TimeseriesSubjectMetadata:
    try:
        return TimeseriesService.get_subject_metadata(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=_parse_source(source),
        )
    except TimeseriesServiceError as exc:
        raise _http_error(exc) from exc


@timeseries_router.get("/datasets/{dataset_id}/subjects/{subject_id}/preview", response_model=TimeseriesSignalResponse)
async def get_timeseries_preview(
    dataset_id: str,
    subject_id: str,
    channels: str = Query(..., description="Comma-separated channel names, for example Fp1,Fp2"),
    max_points: int = Query(5000, ge=2, le=100_000),
    source: str = Query("derivatives"),
    band_filter: str | None = Query(None, description="Optional display bandpass filter."),
    start_time: float | None = Query(None, ge=0),
    end_time: float | None = Query(None, gt=0),
) -> TimeseriesSignalResponse:
    try:
        return TimeseriesService.get_signal(
            dataset_id=dataset_id,
            subject_id=subject_id,
            channels=_parse_channels(channels),
            source=_parse_source(source),
            start_time=start_time,
            end_time=end_time,
            band_filter=_parse_band_filter(band_filter),
            preview=True,
            max_points=max_points,
        )
    except TimeseriesServiceError as exc:
        raise _http_error(exc) from exc


@timeseries_router.get("/datasets/{dataset_id}/subjects/{subject_id}/timeseries-signal", response_model=TimeseriesSignalResponse)
async def get_timeseries_signal(
    dataset_id: str,
    subject_id: str,
    channels: str = Query(..., description="Comma-separated channel names, for example Fp1,Fp2"),
    source: str = Query("derivatives"),
    band_filter: str | None = Query(None, description="Optional display bandpass filter."),
    start_time: float | None = Query(None, ge=0),
    end_time: float | None = Query(None, gt=0),
) -> TimeseriesSignalResponse:
    try:
        return TimeseriesService.get_signal(
            dataset_id=dataset_id,
            subject_id=subject_id,
            channels=_parse_channels(channels),
            source=_parse_source(source),
            start_time=start_time,
            end_time=end_time,
            band_filter=_parse_band_filter(band_filter),
            preview=False,
        )
    except TimeseriesServiceError as exc:
        raise _http_error(exc) from exc


def _parse_channels(channels: str) -> list[str]:
    parsed_channels = [channel.strip() for channel in channels.split(",") if channel.strip()]
    if not parsed_channels:
        raise HTTPException(status_code=400, detail="At least one channel must be requested.")
    return parsed_channels


def _parse_source(source: str) -> TimeseriesSource:
    if source not in ("raw", "derivatives"):
        raise HTTPException(status_code=400, detail="source must be either 'raw' or 'derivatives'.")
    return cast(TimeseriesSource, source)


def _parse_band_filter(band_filter: str | None) -> TimeseriesBandFilter | None:
    if band_filter is None:
        return None
    if band_filter not in ("delta", "theta", "alpha", "beta1", "beta2", "beta3", "gamma"):
        raise HTTPException(
            status_code=400,
            detail="band_filter must be one of: delta, theta, alpha, beta1, beta2, beta3, gamma.",
        )
    return cast(TimeseriesBandFilter, band_filter)


def _http_error(exc: TimeseriesServiceError) -> HTTPException:
    if isinstance(exc, TimeseriesNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, TimeseriesValidationError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, TimeseriesReaderUnavailableError):
        return HTTPException(status_code=503, detail=str(exc))

    logger.error(f"Timeseries service error: {exc}")
    return HTTPException(status_code=500, detail=str(exc))
