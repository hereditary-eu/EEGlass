from __future__ import annotations

import csv
import json
import math
import re
from pathlib import Path
from typing import Any

import numpy as np

from backend.config import CONFIG
from backend.ml.model_vars import MODEL_BANDS
from backend.pydantic_models.timeseries import (
    TimeseriesBandFilter,
    TimeseriesChannelMetadata,
    TimeseriesDatasetInfo,
    TimeseriesSignalResponse,
    TimeseriesSource,
    TimeseriesSubjectInfo,
    TimeseriesSubjectMetadata,
)

_BAND_FILTER_LIMITS: dict[TimeseriesBandFilter, tuple[float, float]] = {
    band_name: (start_hz, end_hz) for band_name, start_hz, end_hz in MODEL_BANDS
}


class TimeseriesServiceError(Exception):
    pass


class TimeseriesNotFoundError(TimeseriesServiceError):
    pass


class TimeseriesValidationError(TimeseriesServiceError):
    pass


class TimeseriesReaderUnavailableError(TimeseriesServiceError):
    pass


class TimeseriesService:
    _VALID_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")
    _DEFAULT_TASK = "eyesclosed"

    @classmethod
    def list_datasets(cls) -> list[TimeseriesDatasetInfo]:
        root = cls._storage_root()
        if not root.exists():
            return []

        datasets: list[TimeseriesDatasetInfo] = []
        for dataset_dir in sorted(item for item in root.iterdir() if item.is_dir()):
            subjects = cls._list_subject_dirs(dataset_dir)
            sources = cls._available_dataset_sources(dataset_dir)
            if not subjects or not sources:
                continue

            datasets.append(
                TimeseriesDatasetInfo(
                    id=dataset_dir.name,
                    name=cls._read_dataset_name(dataset_dir),
                    subject_count=len(subjects),
                    sources=sources,
                )
            )

        return datasets

    @classmethod
    def list_subjects(cls, dataset_id: str) -> list[TimeseriesSubjectInfo]:
        dataset_dir = cls._dataset_dir(dataset_id)
        subjects = []
        for subject_dir in cls._list_subject_dirs(dataset_dir):
            sources = cls._available_subject_sources(dataset_dir, subject_dir.name)
            if sources:
                subjects.append(TimeseriesSubjectInfo(id=subject_dir.name, sources=sources))

        return subjects

    @classmethod
    def get_subject_metadata(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
    ) -> TimeseriesSubjectMetadata:
        raw = cls._open_raw(dataset_id, subject_id, source)
        eeg_file = cls._find_eeg_file(cls._dataset_dir(dataset_id), subject_id, source)
        sidecar = cls._read_json(cls._find_json_sidecar(eeg_file, dataset_id, subject_id, source))
        channels_by_name = cls._read_channels(cls._find_channels_sidecar(eeg_file, dataset_id, subject_id, source))

        sampling_frequency = float(sidecar.get("SamplingFrequency") or raw.info["sfreq"])
        sample_count = int(raw.n_times)
        duration = float(sidecar.get("RecordingDuration") or (sample_count / sampling_frequency))
        channels = [
            cls._channel_metadata(channel_name, channels_by_name.get(channel_name)) for channel_name in raw.ch_names
        ]
        sources = cls._available_subject_sources(cls._dataset_dir(dataset_id), subject_id)

        return TimeseriesSubjectMetadata(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            sampling_frequency=sampling_frequency,
            duration=duration,
            sample_count=sample_count,
            channel_count=len(raw.ch_names),
            channels=channels,
            raw_available="raw" in sources,
            derivatives_available="derivatives" in sources,
            task_name=sidecar.get("TaskName"),
            recording_type=sidecar.get("RecordingType"),
        )

    @classmethod
    def get_signal(
        cls,
        dataset_id: str,
        subject_id: str,
        channels: list[str],
        source: TimeseriesSource = "derivatives",
        start_time: float | None = None,
        end_time: float | None = None,
        band_filter: TimeseriesBandFilter | None = None,
        preview: bool = False,
        max_points: int = 5000,
    ) -> TimeseriesSignalResponse:
        if not channels:
            raise TimeseriesValidationError("At least one channel must be requested.")
        if preview and max_points < 2:
            raise TimeseriesValidationError("max_points must be at least 2 for preview requests.")

        raw = cls._open_raw(dataset_id, subject_id, source)
        sampling_frequency = float(raw.info["sfreq"])
        duration = raw.n_times / sampling_frequency
        invalid_channels = [channel for channel in channels if channel not in raw.ch_names]
        if invalid_channels:
            raise TimeseriesValidationError(
                f"Unknown channel(s): {', '.join(invalid_channels)}. Available channels: {', '.join(raw.ch_names)}"
            )

        start_sample, end_sample, resolved_start_time, resolved_end_time = cls._resolve_sample_range(
            start_time=start_time,
            end_time=end_time,
            sampling_frequency=sampling_frequency,
            sample_count=raw.n_times,
        )

        data = raw.get_data(picks=channels, start=start_sample, stop=end_sample)
        if band_filter is not None:
            data = cls._apply_band_filter(data, sampling_frequency, band_filter)

        selected_sample_count = int(data.shape[1])
        decimation = 1

        if preview and selected_sample_count > max_points:
            indices = np.linspace(0, selected_sample_count - 1, max_points, dtype=int)
            data = data[:, indices]
            decimation = max(1, math.ceil(selected_sample_count / max_points))

        samples = {
            channel: [float(value) for value in data[channel_index].tolist()]
            for channel_index, channel in enumerate(channels)
        }

        return TimeseriesSignalResponse(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            band_filter=band_filter,
            preview=preview,
            channels=channels,
            sampling_frequency=sampling_frequency,
            duration=float(duration),
            start_time=float(resolved_start_time),
            end_time=float(resolved_end_time),
            start_sample=start_sample,
            end_sample=end_sample,
            sample_count=int(data.shape[1]),
            decimation=decimation,
            samples=samples,
        )

    @staticmethod
    def _apply_band_filter(
        data: np.ndarray,
        sampling_frequency: float,
        band_filter: TimeseriesBandFilter,
    ) -> np.ndarray:
        band_limits = _BAND_FILTER_LIMITS.get(band_filter)
        if band_limits is None:
            raise TimeseriesValidationError(f"Unsupported band_filter '{band_filter}'.")

        low_hz, high_hz = band_limits
        nyquist_hz = sampling_frequency / 2
        if low_hz >= nyquist_hz:
            raise TimeseriesValidationError(
                f"Cannot apply {band_filter} filter because its lower cutoff ({low_hz:g}Hz) is above Nyquist "
                f"({nyquist_hz:g}Hz)."
            )

        safe_high_hz = min(high_hz, nyquist_hz - 1e-6)
        if safe_high_hz <= low_hz:
            raise TimeseriesValidationError(
                f"Cannot apply {band_filter} filter at sampling frequency {sampling_frequency:g}Hz."
            )

        try:
            import mne
        except ImportError as exc:
            raise TimeseriesReaderUnavailableError(
                "MNE is required to bandpass-filter EEG signal data but is not available in the active Python environment."
            ) from exc

        try:
            return mne.filter.filter_data(
                data,
                sfreq=sampling_frequency,
                l_freq=low_hz,
                h_freq=safe_high_hz,
                verbose="ERROR",
            )
        except Exception as exc:
            raise TimeseriesServiceError(f"Could not apply {band_filter} bandpass filter: {exc}") from exc

    @classmethod
    def _storage_root(cls) -> Path:
        return Path(CONFIG.DATASET_STORAGE_DIR).resolve()

    @classmethod
    def _dataset_dir(cls, dataset_id: str) -> Path:
        cls._validate_identifier(dataset_id, "dataset_id")
        root = cls._storage_root()
        dataset_dir = (root / dataset_id).resolve()
        cls._ensure_within_root(dataset_dir, root)
        if not dataset_dir.is_dir():
            raise TimeseriesNotFoundError(f"Dataset '{dataset_id}' was not found.")
        return dataset_dir

    @classmethod
    def _validate_identifier(cls, value: str, field_name: str) -> None:
        if not cls._VALID_ID_PATTERN.fullmatch(value):
            raise TimeseriesValidationError(f"Invalid {field_name}: '{value}'.")

    @staticmethod
    def _ensure_within_root(path: Path, root: Path) -> None:
        if not path.is_relative_to(root):
            raise TimeseriesValidationError("Resolved dataset path is outside the configured dataset directory.")

    @classmethod
    def _list_subject_dirs(cls, dataset_dir: Path) -> list[Path]:
        return sorted(item for item in dataset_dir.iterdir() if item.is_dir() and item.name.startswith("sub-"))

    @classmethod
    def _available_dataset_sources(cls, dataset_dir: Path) -> list[TimeseriesSource]:
        sources: list[TimeseriesSource] = []
        if any(dataset_dir.glob("sub-*/eeg/*_eeg.set")):
            sources.append("raw")
        if any(dataset_dir.glob("derivatives/sub-*/eeg/*_eeg.set")):
            sources.append("derivatives")
        return sources

    @classmethod
    def _available_subject_sources(cls, dataset_dir: Path, subject_id: str) -> list[TimeseriesSource]:
        sources: list[TimeseriesSource] = []
        if any((dataset_dir / subject_id / "eeg").glob("*_eeg.set")):
            sources.append("raw")
        if any((dataset_dir / "derivatives" / subject_id / "eeg").glob("*_eeg.set")):
            sources.append("derivatives")
        return sources

    @classmethod
    def _eeg_dir(cls, dataset_dir: Path, subject_id: str, source: TimeseriesSource) -> Path:
        cls._validate_identifier(subject_id, "subject_id")
        if source == "raw":
            return dataset_dir / subject_id / "eeg"
        if source == "derivatives":
            return dataset_dir / "derivatives" / subject_id / "eeg"
        raise TimeseriesValidationError(f"Unsupported source '{source}'.")

    @classmethod
    def _find_eeg_file(cls, dataset_dir: Path, subject_id: str, source: TimeseriesSource) -> Path:
        eeg_dir = cls._eeg_dir(dataset_dir, subject_id, source)
        if not eeg_dir.is_dir():
            raise TimeseriesNotFoundError(f"No {source} EEG folder found for subject '{subject_id}'.")

        preferred = eeg_dir / f"{subject_id}_task-{cls._DEFAULT_TASK}_eeg.set"
        if preferred.is_file():
            return preferred

        candidates = sorted(eeg_dir.glob(f"{subject_id}_*_eeg.set"))
        if candidates:
            return candidates[0]

        raise TimeseriesNotFoundError(f"No {source} EEG .set file found for subject '{subject_id}'.")

    @classmethod
    def _find_json_sidecar(
        cls, eeg_file: Path, dataset_id: str, subject_id: str, source: TimeseriesSource
    ) -> Path | None:
        candidates = [eeg_file.with_suffix(".json")]
        if source == "derivatives":
            try:
                raw_file = cls._find_eeg_file(cls._dataset_dir(dataset_id), subject_id, "raw")
                candidates.append(raw_file.with_suffix(".json"))
            except TimeseriesNotFoundError:
                pass

        return next((candidate for candidate in candidates if candidate.is_file()), None)

    @classmethod
    def _find_channels_sidecar(
        cls, eeg_file: Path, dataset_id: str, subject_id: str, source: TimeseriesSource
    ) -> Path | None:
        channels_name = eeg_file.name.replace("_eeg.set", "_channels.tsv")
        candidates = [eeg_file.parent / channels_name]
        if source == "derivatives":
            try:
                raw_file = cls._find_eeg_file(cls._dataset_dir(dataset_id), subject_id, "raw")
                raw_channels_name = raw_file.name.replace("_eeg.set", "_channels.tsv")
                candidates.append(raw_file.parent / raw_channels_name)
            except TimeseriesNotFoundError:
                pass

        return next((candidate for candidate in candidates if candidate.is_file()), None)

    @staticmethod
    def _read_json(path: Path | None) -> dict[str, Any]:
        if path is None:
            return {}
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    @staticmethod
    def _read_channels(path: Path | None) -> dict[str, dict[str, str]]:
        if path is None:
            return {}
        with path.open("r", encoding="utf-8") as file:
            return {row["name"]: row for row in csv.DictReader(file, delimiter="\t") if row.get("name")}

    @staticmethod
    def _channel_metadata(channel_name: str, row: dict[str, str] | None) -> TimeseriesChannelMetadata:
        if row is None:
            return TimeseriesChannelMetadata(name=channel_name)
        return TimeseriesChannelMetadata(name=channel_name, type=row.get("type"), units=row.get("units"))

    @classmethod
    def _open_raw(cls, dataset_id: str, subject_id: str, source: TimeseriesSource):
        dataset_dir = cls._dataset_dir(dataset_id)
        eeg_file = cls._find_eeg_file(dataset_dir, subject_id, source)

        try:
            import mne
        except ImportError as exc:
            raise TimeseriesReaderUnavailableError(
                "MNE is required to read EEGLAB .set files but is not available in the active Python environment."
            ) from exc

        try:
            return mne.io.read_raw_eeglab(eeg_file, preload=False, verbose="ERROR")
        except Exception as exc:
            raise TimeseriesServiceError(f"Could not read EEG file '{eeg_file}': {exc}") from exc

    @staticmethod
    def _resolve_sample_range(
        start_time: float | None,
        end_time: float | None,
        sampling_frequency: float,
        sample_count: int,
    ) -> tuple[int, int, float, float]:
        duration = sample_count / sampling_frequency
        resolved_start_time = 0.0 if start_time is None else start_time
        resolved_end_time = duration if end_time is None else end_time

        if resolved_start_time < 0:
            raise TimeseriesValidationError("start_time must be greater than or equal to 0.")
        if resolved_end_time <= resolved_start_time:
            raise TimeseriesValidationError("end_time must be greater than start_time.")
        if resolved_end_time > duration:
            raise TimeseriesValidationError(
                f"end_time must be less than or equal to recording duration ({duration:.3f}s)."
            )

        start_sample = max(0, int(math.floor(resolved_start_time * sampling_frequency)))
        end_sample = min(sample_count, int(math.ceil(resolved_end_time * sampling_frequency)))
        if end_sample <= start_sample:
            raise TimeseriesValidationError("Resolved sample range is empty.")

        return start_sample, end_sample, resolved_start_time, resolved_end_time

    @staticmethod
    def _read_dataset_name(dataset_dir: Path) -> str | None:
        description_path = dataset_dir / "dataset_description.json"
        if not description_path.is_file():
            return None

        try:
            with description_path.open("r", encoding="utf-8") as file:
                data = json.load(file)
            name = data.get("Name")
            return str(name) if name else None
        except Exception:
            return None
