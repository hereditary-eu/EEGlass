from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal, TypeVar

import numpy as np
from scipy.integrate import trapezoid

from backend.ml.data_utils.load_data import preprocess_raw_for_xeegnet, preprocessed_raw_to_windows
from backend.ml.model import build_xeegnet
from backend.ml.model_registry import ModelSpec, get_model_spec, list_model_specs
from backend.ml.model_vars import (
    DEFAULT_MODEL_NAME,
    MODEL_INPUT_SOURCE,
    MODEL_BANDS,
    MODEL_CHANNELS,
    MODEL_CLASS_LABELS,
    PARAMETERS_DEFAULT,
    get_embedding_feature_names,
)
from backend.pydantic_models.inference import (
    ModelBandPowerResponse,
    ModelBandPowerStatsResponse,
    ModelBandPowerStatsValue,
    ModelBandPowerValue,
    ModelChannelBandPower,
    ModelChannelBandPowerStats,
    ModelClassEvidenceBand,
    ModelClassEvidenceContribution,
    ModelClassEvidenceResponse,
    ModelClassWeight,
    ModelClassWeightsBand,
    ModelClassWeightsResponse,
    ModelInfoResponse,
    ModelInferenceResponse,
    ModelListItem,
    ModelListResponse,
    ModelScalpTopologyBand,
    ModelScalpTopologyChannel,
    ModelScalpTopologyGrid,
    ModelScalpTopologyResponse,
    ModelWindowScalpTopologyBand,
    ModelWindowScalpTopologyChannel,
    ModelWindowScalpTopologyMode,
    ModelWindowScalpTopologyResponse,
    ModelPatientEmbeddingReduction,
    ModelWindowEmbeddingPoint,
    ModelWindowEmbeddingsResponse,
    WindowPrediction,
)
from backend.pydantic_models.timeseries import TimeseriesSource
from backend.services.embedding_service import cluster_embeddings_density, reduce_embeddings_pca
from backend.services.model_errors import (
    ModelDependencyUnavailableError,
    ModelInferenceUnavailableError,
    ModelNotFoundError,
    ModelServiceError,
    ModelValidationError,
)
from backend.services.timeseries_service import (
    TimeseriesNotFoundError,
    TimeseriesReaderUnavailableError,
    TimeseriesService,
    TimeseriesServiceError,
    TimeseriesValidationError,
)

K = TypeVar("K")
V = TypeVar("V")
MIN_RELATIVE_POWER_FOR_DB = 1e-6


def remember(cache: OrderedDict[K, V], key: K, value: V, limit: int) -> None:
    cache[key] = value
    cache.move_to_end(key)
    while len(cache) > limit:
        cache.popitem(last=False)


def validate_window_index(window_index: int, window_count: int) -> None:
    if window_index < 0:
        raise ModelValidationError("window_index must be greater than or equal to 0.")
    if window_index >= window_count:
        raise ModelValidationError(
            f"window_index must be less than the number of available prediction windows ({window_count})."
        )


def validate_model_input_source(source: TimeseriesSource) -> None:
    if source != MODEL_INPUT_SOURCE:
        raise ModelValidationError(
            "Model workflows use derivatives only. The raw source is available for timeseries visualization."
        )


@dataclass
class PreparedSubjectData:
    windows: np.ndarray
    sampling_frequency: float
    prediction_ranges: list[tuple[float, float]]


@dataclass
class ModelInferenceResult:
    response: ModelInferenceResponse
    mean_penultimate_embedding: list[float]
    penultimate_embeddings: list[list[float]]


@dataclass(frozen=True)
class BandPowerComputationPlan:
    taper: np.ndarray
    window_norm: float
    freqs: np.ndarray
    total_mask: np.ndarray
    has_total_bins: bool
    band_masks: tuple[np.ndarray, ...]
    has_band_bins: tuple[bool, ...]


class SubjectPreprocessingService:
    _SUBJECT_CACHE_LIMIT = 8
    _subject_data_cache: OrderedDict[tuple[str, str, str, TimeseriesSource], PreparedSubjectData] = OrderedDict()

    @classmethod
    def get_prepared_subject_data(
        cls,
        model_spec: ModelSpec,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource,
    ) -> PreparedSubjectData:
        validate_model_input_source(source)
        cache_key = (model_spec.name, dataset_id, subject_id, source)
        cached_subject_data = cls._subject_data_cache.get(cache_key)
        if cached_subject_data is not None:
            cls._subject_data_cache.move_to_end(cache_key)
            return cached_subject_data

        raw = cls._open_raw(dataset_id, subject_id, source)
        try:
            working_raw = preprocess_raw_for_xeegnet(raw)
            windows, sampling_frequency, prediction_ranges = preprocessed_raw_to_windows(
                working_raw,
                sample_length=model_spec.sample_length,
            )
        except ValueError as exc:
            if "required model channels" in str(exc) or "too short for inference" in str(exc):
                raise ModelValidationError(str(exc)) from exc
            raise ModelServiceError(f"Could not prepare EEG recording for inference: {exc}") from exc
        except Exception as exc:
            raise ModelServiceError(f"Could not prepare EEG recording for inference: {exc}") from exc

        subject_data = PreparedSubjectData(
            windows=windows,
            sampling_frequency=sampling_frequency,
            prediction_ranges=prediction_ranges,
        )
        remember(cls._subject_data_cache, cache_key, subject_data, cls._SUBJECT_CACHE_LIMIT)
        return subject_data

    @staticmethod
    def _open_raw(dataset_id: str, subject_id: str, source: TimeseriesSource):
        try:
            return TimeseriesService._open_raw(dataset_id, subject_id, source)
        except TimeseriesNotFoundError as exc:
            raise ModelNotFoundError(str(exc)) from exc
        except TimeseriesValidationError as exc:
            raise ModelValidationError(str(exc)) from exc
        except TimeseriesReaderUnavailableError as exc:
            raise ModelDependencyUnavailableError(str(exc)) from exc
        except TimeseriesServiceError as exc:
            raise ModelServiceError(str(exc)) from exc


class ModelRuntime:
    _cached_models: dict[str, Any] = {}
    _cached_model_signatures: dict[str, str] = {}

    @classmethod
    def checkpoint_signature(cls, model_spec: ModelSpec) -> str:
        checkpoint_path = model_spec.checkpoint_path.resolve()
        if not checkpoint_path.is_file():
            raise ModelServiceError(f"Pretrained model weights were not found at '{checkpoint_path}'.")
        stat = checkpoint_path.stat()
        return f"{checkpoint_path}:{stat.st_mtime_ns}:{stat.st_size}"

    @classmethod
    def run_inference(cls, model_spec: ModelSpec, windows: np.ndarray) -> np.ndarray:
        probabilities, _features = cls.run_inference_with_embeddings(model_spec, windows)
        return probabilities

    @classmethod
    def run_inference_with_embeddings(cls, model_spec: ModelSpec, windows: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        torch_module = cls.import_torch()
        model = cls.get_model(torch_module, model_spec)
        batch = torch_module.tensor(windows, dtype=torch_module.float32)

        with torch_module.no_grad():
            features = model.encoder(batch)
            logits = model.Dense(features)
            probabilities = torch_module.softmax(logits, dim=1)

        return probabilities.detach().cpu().numpy(), features.detach().cpu().numpy()

    @classmethod
    def get_model(cls, torch_module, model_spec: ModelSpec):
        checkpoint_signature = cls.checkpoint_signature(model_spec)
        cached_model = cls._cached_models.get(model_spec.name)
        if cached_model is not None and cls._cached_model_signatures.get(model_spec.name) == checkpoint_signature:
            return cached_model

        try:
            model = build_xeegnet()
            state_dict = torch_module.load(model_spec.checkpoint_path.resolve(), map_location="cpu")
            model.load_state_dict(state_dict)
            model.to("cpu")
            model.eval()
        except ImportError as exc:
            raise ModelDependencyUnavailableError(
                "xEEGNet dependencies are unavailable in the active Python environment."
            ) from exc
        except Exception as exc:
            raise ModelServiceError(f"Could not load pretrained xEEGNet weights: {exc}") from exc

        cls._cached_models[model_spec.name] = model
        cls._cached_model_signatures[model_spec.name] = checkpoint_signature
        return model

    @staticmethod
    def import_torch():
        try:
            import torch
        except ImportError as exc:
            raise ModelDependencyUnavailableError(
                "PyTorch is required for model inference but is not available in the active Python environment."
            ) from exc

        return torch


def build_inference_response(
    *,
    dataset_id: str,
    subject_id: str,
    source: TimeseriesSource,
    sampling_frequency: float,
    prediction_ranges: list[tuple[float, float]],
    probabilities: np.ndarray,
) -> ModelInferenceResponse:
    predictions: list[WindowPrediction] = []
    for window_index, (row, time_range) in enumerate(zip(probabilities, prediction_ranges, strict=True)):
        predicted_class_id = int(np.argmax(row))
        predicted_label = MODEL_CLASS_LABELS[predicted_class_id]
        confidence = float(row[predicted_class_id])
        probabilities_by_label = {label: float(row[class_id]) for class_id, label in MODEL_CLASS_LABELS.items()}
        predictions.append(
            WindowPrediction(
                window_index=window_index,
                start_time=time_range[0],
                end_time=time_range[1],
                predicted_class_id=predicted_class_id,
                predicted_label=predicted_label,
                confidence=confidence,
                probabilities=probabilities_by_label,
            )
        )

    return ModelInferenceResponse(
        dataset_id=dataset_id,
        subject_id=subject_id,
        source=source,
        window_size_seconds=prediction_ranges[0][1] - prediction_ranges[0][0] if prediction_ranges else 0.0,
        sampling_frequency=sampling_frequency,
        predictions=predictions,
    )


def build_model_info_response(model_spec: ModelSpec) -> ModelInfoResponse:
    return ModelInfoResponse(
        name=model_spec.name,
        display_name=model_spec.display_name,
        architecture=model_spec.architecture,
        model_summary=build_model_summary(model_spec),
        classes=[
            {
                "class_id": class_spec.class_id,
                "label": class_spec.label,
                "compact_label": class_spec.compact_label,
            }
            for class_spec in model_spec.classes
        ],
        bands=[
            {
                "band": band_name,
                "label": band_name,
                "start_hz": start_hz,
                "end_hz": end_hz,
            }
            for band_name, start_hz, end_hz in model_spec.bands
        ],
        metadata={
            "API name": model_spec.name,
            "Architecture": model_spec.architecture,
            "Input channels": len(model_spec.channels),
            "Window": f"{model_spec.window_size_seconds:g}s",
            "Sampling rate": f"{model_spec.sampling_frequency:g} Hz",
            "Sample length": model_spec.sample_length,
            "Classes": [class_spec.label for class_spec in model_spec.classes],
        },
    )


def build_model_summary(model_spec: ModelSpec) -> str:
    torch_module = ModelRuntime.import_torch()
    model = ModelRuntime.get_model(torch_module, model_spec)

    return str(model)


def compute_class_evidence_response(
    *,
    model_spec: ModelSpec,
    subject_data: PreparedSubjectData,
    dataset_id: str,
    subject_id: str,
    source: TimeseriesSource,
    window_index: int,
) -> ModelClassEvidenceResponse:
    torch_module = ModelRuntime.import_torch()
    model = ModelRuntime.get_model(torch_module, model_spec)
    window = torch_module.tensor(subject_data.windows[window_index : window_index + 1], dtype=torch_module.float32)

    with torch_module.no_grad():
        band_features_tensor = model.encoder(window)
        logits_tensor = model.Dense(band_features_tensor)
        probabilities_tensor = torch_module.softmax(logits_tensor, dim=1)

    band_features = band_features_tensor.detach().cpu().numpy()[0]
    dense_weights = model.Dense.weight.detach().cpu().numpy()
    logits = logits_tensor.detach().cpu().numpy()[0]
    probabilities = probabilities_tensor.detach().cpu().numpy()[0]
    contributions_by_class_and_band = dense_weights * band_features[np.newaxis, :]
    max_abs_contribution = (
        float(np.max(np.abs(contributions_by_class_and_band))) if contributions_by_class_and_band.size else 0.0
    )
    predicted_class_id = int(np.argmax(probabilities))
    start_time, end_time = subject_data.prediction_ranges[window_index]

    return ModelClassEvidenceResponse(
        dataset_id=dataset_id,
        subject_id=subject_id,
        source=source,
        window_index=window_index,
        start_time=start_time,
        end_time=end_time,
        predicted_class_id=predicted_class_id,
        predicted_label=MODEL_CLASS_LABELS[predicted_class_id],
        confidence=float(probabilities[predicted_class_id]),
        probabilities={label: float(probabilities[class_id]) for class_id, label in MODEL_CLASS_LABELS.items()},
        logits={label: float(logits[class_id]) for class_id, label in MODEL_CLASS_LABELS.items()},
        unit_label="logit contribution",
        global_max_abs_contribution=max_abs_contribution,
        bands=[
            ModelClassEvidenceBand(
                band=band_name,
                feature_value=float(band_features[band_index]),
                class_contributions=[
                    ModelClassEvidenceContribution(
                        class_id=class_id,
                        class_label=class_label,
                        contribution=float(contributions_by_class_and_band[class_id, band_index]),
                    )
                    for class_id, class_label in MODEL_CLASS_LABELS.items()
                ],
            )
            for band_index, (band_name, _, _) in enumerate(MODEL_BANDS)
        ],
    )


def build_class_weights_response(model_spec: ModelSpec) -> ModelClassWeightsResponse:
    torch_module = ModelRuntime.import_torch()
    model = ModelRuntime.get_model(torch_module, model_spec)
    dense_weights = model.Dense.weight.detach().cpu().numpy()
    max_abs_weight = float(np.max(np.abs(dense_weights))) if dense_weights.size else 0.0

    return ModelClassWeightsResponse(
        model_name=model_spec.name,
        checkpoint_signature=ModelRuntime.checkpoint_signature(model_spec),
        layer_name="Dense",
        unit_label="weight",
        global_max_abs_weight=max_abs_weight,
        bands=[
            ModelClassWeightsBand(
                band=band_name,
                class_weights=[
                    ModelClassWeight(
                        class_id=class_id,
                        class_label=class_label,
                        weight=float(dense_weights[class_id, band_index]),
                    )
                    for class_id, class_label in MODEL_CLASS_LABELS.items()
                ],
            )
            for band_index, (band_name, _, _) in enumerate(MODEL_BANDS)
        ],
    )


def compute_band_power_response(
    *,
    subject_data: PreparedSubjectData,
    dataset_id: str,
    subject_id: str,
    source: TimeseriesSource,
    window_index: int,
) -> ModelBandPowerResponse:
    absolute_power, relative_power = compute_band_power_arrays(
        subject_data.windows[window_index],
        subject_data.sampling_frequency,
    )
    window_absolute_power = absolute_power[0]
    window_relative_power = relative_power[0]

    channel_band_powers: list[ModelChannelBandPower] = []
    for channel_index, channel_name in enumerate(MODEL_CHANNELS):
        channel_band_powers.append(
            ModelChannelBandPower(
                channel=channel_name,
                bands=[
                    ModelBandPowerValue(
                        band=band_name,
                        start_hz=start_hz,
                        end_hz=end_hz,
                        absolute_power=float(window_absolute_power[channel_index, band_index]),
                        relative_power=float(window_relative_power[channel_index, band_index]),
                    )
                    for band_index, (band_name, start_hz, end_hz) in enumerate(MODEL_BANDS)
                ],
            )
        )
    start_time, end_time = subject_data.prediction_ranges[window_index]

    return ModelBandPowerResponse(
        dataset_id=dataset_id,
        subject_id=subject_id,
        source=source,
        window_index=window_index,
        start_time=start_time,
        end_time=end_time,
        sampling_frequency=subject_data.sampling_frequency,
        channels=channel_band_powers,
    )


def compute_band_power_stats_response(
    *,
    model_spec: ModelSpec,
    dataset_id: str,
    subject_id: str,
    source: TimeseriesSource,
    mode: Literal["intra_patient", "inter_patient"],
) -> ModelBandPowerStatsResponse:
    if mode == "intra_patient":
        subject_data = SubjectPreprocessingService.get_prepared_subject_data(model_spec, dataset_id, subject_id, source)
        relative_power_db = compute_subject_relative_band_power_db(subject_data)
        stats_values = relative_power_db
        subject_count = 1
        window_count = int(relative_power_db.shape[0])
    else:
        subject_means = []
        window_count = 0
        for subject in TimeseriesService.list_subjects(dataset_id):
            try:
                subject_data = SubjectPreprocessingService.get_prepared_subject_data(
                    model_spec, dataset_id, subject.id, source
                )
                relative_power_db = compute_subject_relative_band_power_db(subject_data)
            except ModelServiceError, TimeseriesServiceError:
                continue
            if relative_power_db.size == 0:
                continue

            subject_means.append(np.mean(relative_power_db, axis=0))
            window_count += int(relative_power_db.shape[0])

        if not subject_means:
            raise ModelValidationError("No subjects are available for inter-patient band power statistics.")

        stats_values = np.stack(subject_means, axis=0)
        subject_count = len(subject_means)

    return build_band_power_stats_response(
        dataset_id=dataset_id,
        subject_id=subject_id,
        source=source,
        mode=mode,
        unit_label="dB re channel total band power",
        subject_count=subject_count,
        window_count=window_count,
        stats_values=stats_values,
    )


def compute_subject_relative_band_power_db(subject_data: PreparedSubjectData) -> np.ndarray:
    if subject_data.windows.shape[0] == 0:
        return np.empty((0, len(MODEL_CHANNELS), len(MODEL_BANDS)), dtype=np.float64)

    _absolute_power, relative_power = compute_band_power_arrays(
        subject_data.windows,
        subject_data.sampling_frequency,
    )
    return 10 * np.log10(np.maximum(relative_power, MIN_RELATIVE_POWER_FOR_DB))


def compute_window_relative_band_powers(window: np.ndarray, sampling_frequency: float) -> np.ndarray:
    _absolute_power, relative_power = compute_band_power_arrays(window, sampling_frequency)
    return relative_power[0]


def compute_band_power_arrays(windows: np.ndarray, sampling_frequency: float) -> tuple[np.ndarray, np.ndarray]:
    window_data = np.array(windows, dtype=np.float64, copy=True)
    if window_data.ndim == 2:
        window_data = window_data[np.newaxis, :, :]
    elif window_data.ndim != 3:
        raise ModelValidationError(
            "Expected EEG windows with shape (channels, samples) or (windows, channels, samples)."
        )

    if window_data.shape[1] != len(MODEL_CHANNELS):
        raise ModelValidationError(f"Expected {len(MODEL_CHANNELS)} EEG channels, found {window_data.shape[1]}.")

    plan = get_band_power_computation_plan(window_data.shape[-1], sampling_frequency)
    window_data -= np.mean(window_data, axis=-1, keepdims=True)

    spectrum = np.fft.rfft(window_data * plan.taper, axis=-1)
    psd = (np.abs(spectrum) ** 2) / (sampling_frequency * plan.window_norm)

    if plan.has_total_bins:
        total_power = trapezoid(psd[..., plan.total_mask], plan.freqs[plan.total_mask], axis=-1)
    else:
        total_power = np.zeros(psd.shape[:2], dtype=np.float64)

    absolute_power = np.empty((*psd.shape[:2], len(MODEL_BANDS)), dtype=np.float64)
    for band_index, (band_mask, has_band_bins) in enumerate(zip(plan.band_masks, plan.has_band_bins, strict=True)):
        if has_band_bins:
            absolute_power[..., band_index] = trapezoid(psd[..., band_mask], plan.freqs[band_mask], axis=-1)
        else:
            absolute_power[..., band_index] = 0.0

    safe_total_power = np.where(total_power > 0, total_power, 1.0)
    relative_power = absolute_power / safe_total_power[..., np.newaxis]
    return absolute_power, relative_power


@lru_cache(maxsize=32)
def get_band_power_computation_plan(sample_count: int, sampling_frequency: float) -> BandPowerComputationPlan:
    if sample_count < 2:
        raise ModelValidationError("Recording is too short to compute band power.")

    taper = np.hanning(sample_count)
    window_norm = float(np.sum(taper**2))
    if window_norm <= 0:
        raise ModelServiceError("Could not compute band power due to invalid window normalization.")

    freqs = np.fft.rfftfreq(sample_count, d=1.0 / sampling_frequency)
    total_mask = (freqs >= MODEL_BANDS[0][1]) & (freqs <= MODEL_BANDS[-1][2])

    band_masks = tuple(
        (freqs >= start_hz) & (freqs < end_hz if band_name != MODEL_BANDS[-1][0] else freqs <= end_hz)
        for band_name, start_hz, end_hz in MODEL_BANDS
    )
    return BandPowerComputationPlan(
        taper=taper,
        window_norm=window_norm,
        freqs=freqs,
        total_mask=total_mask,
        has_total_bins=bool(np.any(total_mask)),
        band_masks=band_masks,
        has_band_bins=tuple(bool(np.any(band_mask)) for band_mask in band_masks),
    )


def build_band_power_stats_response(
    *,
    dataset_id: str,
    subject_id: str,
    source: TimeseriesSource,
    mode: Literal["intra_patient", "inter_patient"],
    unit_label: str,
    subject_count: int,
    window_count: int,
    stats_values: np.ndarray,
) -> ModelBandPowerStatsResponse:
    means = np.mean(stats_values, axis=0)
    stds = np.std(stats_values, axis=0)

    return ModelBandPowerStatsResponse(
        dataset_id=dataset_id,
        subject_id=subject_id,
        source=source,
        mode=mode,
        unit_label=unit_label,
        subject_count=subject_count,
        window_count=window_count,
        channels=[
            ModelChannelBandPowerStats(
                channel=channel_name,
                bands=[
                    ModelBandPowerStatsValue(
                        band=band_name,
                        start_hz=start_hz,
                        end_hz=end_hz,
                        mean_db=float(means[channel_index, band_index]),
                        lower_2sigma_db=float(means[channel_index, band_index] - 2 * stds[channel_index, band_index]),
                        upper_2sigma_db=float(means[channel_index, band_index] + 2 * stds[channel_index, band_index]),
                        sample_count=int(stats_values.shape[0]),
                    )
                    for band_index, (band_name, start_hz, end_hz) in enumerate(MODEL_BANDS)
                ],
            )
            for channel_index, channel_name in enumerate(MODEL_CHANNELS)
        ],
    )


def build_scalp_topology_response(model_spec: ModelSpec) -> ModelScalpTopologyResponse:
    torch_module = ModelRuntime.import_torch()
    model = ModelRuntime.get_model(torch_module, model_spec)
    conv2_weights = model.encoder.conv2.weight.detach().cpu().numpy().squeeze(1).squeeze(-1)
    grid_resolution = 72
    channel_positions, grid_x, grid_y, interpolated_band_values = compute_mne_topology_grid(
        conv2_weights,
        grid_resolution,
    )
    topology_values = [conv2_weights.ravel()]
    topology_values.extend(interpolated_values.ravel() for interpolated_values in interpolated_band_values)
    global_values = np.concatenate(topology_values) if topology_values else np.array([], dtype=float)
    global_min_weight = float(np.min(global_values)) if global_values.size else 0.0
    global_max_weight = float(np.max(global_values)) if global_values.size else 0.0

    return ModelScalpTopologyResponse(
        layer_name="encoder.conv2",
        unit_label="weight",
        global_min_weight=global_min_weight,
        global_max_weight=global_max_weight,
        grid=ModelScalpTopologyGrid(
            resolution=grid_resolution,
            x=grid_x.astype(float).ravel().tolist(),
            y=grid_y.astype(float).ravel().tolist(),
        ),
        bands=[
            ModelScalpTopologyBand(
                band=band_name,
                grid_values=interpolated_values.astype(float).ravel().tolist(),
                channels=[
                    ModelScalpTopologyChannel(
                        name=channel_name,
                        x=float(channel_positions[channel_name][0]),
                        y=float(channel_positions[channel_name][1]),
                        weight=float(channel_weight),
                    )
                    for channel_name, channel_weight in zip(MODEL_CHANNELS, band_weights, strict=True)
                ],
            )
            for (band_name, _, _), band_weights, interpolated_values in zip(
                MODEL_BANDS,
                conv2_weights,
                interpolated_band_values,
                strict=True,
            )
        ],
    )


def compute_window_scalp_topology_response(
    *,
    model_spec: ModelSpec,
    subject_data: PreparedSubjectData,
    dataset_id: str,
    subject_id: str,
    source: TimeseriesSource,
    window_index: int,
) -> ModelWindowScalpTopologyResponse:
    validate_window_index(window_index, len(subject_data.prediction_ranges))
    torch_module = ModelRuntime.import_torch()
    model = ModelRuntime.get_model(torch_module, model_spec)
    conv2_weights = model.encoder.conv2.weight.detach().cpu().numpy().squeeze(1).squeeze(-1)
    band_power_response = compute_band_power_response(
        subject_data=subject_data,
        dataset_id=dataset_id,
        subject_id=subject_id,
        source=source,
        window_index=window_index,
    )
    input_power_values = np.array(
        [
            [channel.bands[band_index].relative_power for channel in band_power_response.channels]
            for band_index in range(len(MODEL_BANDS))
        ],
        dtype=float,
    )
    if input_power_values.shape != conv2_weights.shape:
        raise ModelServiceError(
            "Could not compute scalp topology because band power and model weight dimensions do not match."
        )

    weighted_contribution_values = input_power_values * conv2_weights
    grid_resolution = 72
    channel_positions, grid_x, grid_y, input_power_grids = compute_mne_topology_grid(
        input_power_values,
        grid_resolution,
    )
    _, _, _, weighted_contribution_grids = compute_mne_topology_grid(
        weighted_contribution_values,
        grid_resolution,
    )
    checkpoint_signature = ModelRuntime.checkpoint_signature(model_spec)

    return ModelWindowScalpTopologyResponse(
        dataset_id=dataset_id,
        subject_id=subject_id,
        source=source,
        model_name=model_spec.name,
        checkpoint_signature=checkpoint_signature,
        window_index=window_index,
        start_time=band_power_response.start_time,
        end_time=band_power_response.end_time,
        layer_name="encoder.conv2",
        grid=ModelScalpTopologyGrid(
            resolution=grid_resolution,
            x=grid_x.astype(float).ravel().tolist(),
            y=grid_y.astype(float).ravel().tolist(),
        ),
        modes=[
            build_window_scalp_topology_mode(
                mode="weighted_contribution",
                label="Weighted contribution",
                unit_label="rel power x W",
                color_scale="diverging",
                values=weighted_contribution_values,
                interpolated_values=weighted_contribution_grids,
                channel_positions=channel_positions,
            ),
            build_window_scalp_topology_mode(
                mode="input_power",
                label="Input power",
                unit_label="rel power",
                color_scale="sequential",
                values=input_power_values,
                interpolated_values=input_power_grids,
                channel_positions=channel_positions,
            ),
        ],
    )


def build_window_scalp_topology_mode(
    *,
    mode: Literal["weighted_contribution", "input_power"],
    label: str,
    unit_label: str,
    color_scale: Literal["diverging", "sequential"],
    values: np.ndarray,
    interpolated_values: list[np.ndarray],
    channel_positions: dict[str, tuple[float, float]],
) -> ModelWindowScalpTopologyMode:
    finite_values = [values.ravel()]
    finite_values.extend(interpolated_value.ravel() for interpolated_value in interpolated_values)
    global_values = np.concatenate(finite_values) if finite_values else np.array([], dtype=float)
    if color_scale == "diverging":
        max_abs_value = float(np.max(np.abs(global_values))) if global_values.size else 0.0
        global_min_value = -max_abs_value
        global_max_value = max_abs_value
    else:
        global_min_value = 0.0
        global_max_value = float(np.max(global_values)) if global_values.size else 0.0

    return ModelWindowScalpTopologyMode(
        mode=mode,
        label=label,
        unit_label=unit_label,
        color_scale=color_scale,
        global_min_value=global_min_value,
        global_max_value=global_max_value,
        bands=[
            ModelWindowScalpTopologyBand(
                band=band_name,
                grid_values=interpolated_band_values.astype(float).ravel().tolist(),
                channels=[
                    ModelWindowScalpTopologyChannel(
                        name=channel_name,
                        x=float(channel_positions[channel_name][0]),
                        y=float(channel_positions[channel_name][1]),
                        value=float(channel_value),
                    )
                    for channel_name, channel_value in zip(MODEL_CHANNELS, band_values, strict=True)
                ],
            )
            for (band_name, _, _), band_values, interpolated_band_values in zip(
                MODEL_BANDS,
                values,
                interpolated_values,
                strict=True,
            )
        ],
    )


def compute_mne_topology_grid(weights: np.ndarray, resolution: int):
    try:
        import mne
        from mne.viz.topomap import _get_pos_outlines, _setup_interp
    except ImportError as exc:
        raise ModelDependencyUnavailableError(
            "MNE is required for scalp topology interpolation but is not available."
        ) from exc

    info = mne.create_info(list(MODEL_CHANNELS), sfreq=float(PARAMETERS_DEFAULT["srate"]), ch_types="eeg")
    montage = mne.channels.make_standard_montage("standard_1020")
    info.set_montage(montage, on_missing="raise")
    picks = list(range(len(MODEL_CHANNELS)))
    positions, outlines = _get_pos_outlines(info, picks, sphere=None)
    _extent, xi, yi, interpolator = _setup_interp(
        positions,
        resolution,
        "cubic",
        "head",
        outlines,
        "mean",
    )

    normalization_radius = float(max(np.max(np.abs(xi)), np.max(np.abs(yi)), 1e-12))
    normalized_positions = positions / normalization_radius
    channel_positions = {
        channel_name: (float(position[0]), float(-position[1]))
        for channel_name, position in zip(MODEL_CHANNELS, normalized_positions, strict=True)
    }
    normalized_x = xi / normalization_radius
    normalized_y = -yi / normalization_radius
    interpolated_values = []
    for band_weights in weights:
        values = interpolator.set_values(band_weights).set_locations(xi, yi)()
        interpolated_values.append(np.nan_to_num(values, nan=0.0, posinf=0.0, neginf=0.0))

    return channel_positions, normalized_x, normalized_y, interpolated_values


__all__ = [
    "ModelDependencyUnavailableError",
    "ModelInferenceUnavailableError",
    "ModelNotFoundError",
    "ModelService",
    "ModelServiceError",
    "ModelValidationError",
]


class ModelService:
    _current_model_name = DEFAULT_MODEL_NAME
    _CHECKPOINT_READY_FOR_INFERENCE = True
    _CHECKPOINT_UNAVAILABLE_MESSAGE = (
        "Inference is temporarily unavailable. The current pretrained checkpoint is incompatible with the corrected "
        "4-second preprocessing pipeline and must be retrained."
    )
    _INFERENCE_CACHE_LIMIT = 16
    _CLASS_EVIDENCE_CACHE_LIMIT = 64
    _CLASS_WEIGHTS_CACHE_LIMIT = 4
    _BAND_POWER_CACHE_LIMIT = 16
    _BAND_POWER_STATS_CACHE_LIMIT = 8
    _SCALP_TOPOLOGY_CACHE_LIMIT = 4
    _WINDOW_SCALP_TOPOLOGY_CACHE_LIMIT = 64
    _inference_cache: OrderedDict[tuple[str, str, str, TimeseriesSource, str], ModelInferenceResponse] = OrderedDict()
    _class_evidence_cache: OrderedDict[
        tuple[str, str, str, TimeseriesSource, int, str],
        ModelClassEvidenceResponse,
    ] = OrderedDict()
    _class_weights_cache: OrderedDict[str, ModelClassWeightsResponse] = OrderedDict()
    _band_power_cache: OrderedDict[tuple[str, str, str, TimeseriesSource, int], ModelBandPowerResponse] = OrderedDict()
    _band_power_stats_cache: OrderedDict[
        tuple[str, str, str, TimeseriesSource, Literal["intra_patient", "inter_patient"]],
        ModelBandPowerStatsResponse,
    ] = OrderedDict()
    _scalp_topology_cache: OrderedDict[str, ModelScalpTopologyResponse] = OrderedDict()
    _window_scalp_topology_cache: OrderedDict[
        tuple[str, str, str, TimeseriesSource, int, str],
        ModelWindowScalpTopologyResponse,
    ] = OrderedDict()

    @classmethod
    def get_checkpoint_signature(cls, model_name: str = DEFAULT_MODEL_NAME) -> str:
        return ModelRuntime.checkpoint_signature(cls._get_model_spec(model_name))

    @classmethod
    def get_model_spec(cls, model_name: str = DEFAULT_MODEL_NAME) -> ModelSpec:
        return cls._get_model_spec(model_name)

    @classmethod
    def get_model_info(cls, model_name: str = DEFAULT_MODEL_NAME) -> ModelInfoResponse:
        return build_model_info_response(cls._get_model_spec(model_name))

    @classmethod
    def get_current_model_info(cls) -> ModelInfoResponse:
        return cls.get_model_info(cls._current_model_name)

    @classmethod
    def list_models(cls) -> ModelListResponse:
        model_specs = list_model_specs()
        if model_specs and not any(model_spec.name == cls._current_model_name for model_spec in model_specs):
            cls._current_model_name = model_specs[0].name
        if not model_specs:
            cls._current_model_name = ""

        return ModelListResponse(
            current_model_name=cls._current_model_name,
            models=[
                ModelListItem(
                    name=model_spec.name,
                    display_name=model_spec.display_name,
                    architecture=model_spec.architecture,
                    is_current=model_spec.name == cls._current_model_name,
                )
                for model_spec in model_specs
            ],
        )

    @classmethod
    def set_current_model(cls, model_name: str) -> ModelInfoResponse:
        model_spec = cls._get_model_spec(model_name)
        cls._current_model_name = model_spec.name
        return build_model_info_response(model_spec)

    @classmethod
    def infer_subject(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
        model_name: str = DEFAULT_MODEL_NAME,
    ) -> ModelInferenceResponse:
        validate_model_input_source(source)
        return cls._infer_subject_result(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            model_name=model_name,
            include_penultimate_embedding=False,
        ).response

    @classmethod
    def infer_subject_with_embedding(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
        model_name: str = DEFAULT_MODEL_NAME,
    ) -> ModelInferenceResult:
        validate_model_input_source(source)
        return cls._infer_subject_result(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            model_name=model_name,
            include_penultimate_embedding=True,
        )

    @classmethod
    def compute_subject_window_embeddings(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
        model_name: str = DEFAULT_MODEL_NAME,
    ) -> ModelWindowEmbeddingsResponse:
        validate_model_input_source(source)
        cls._ensure_inference_available()
        model_spec = cls._get_model_spec(model_name)
        subject_data = SubjectPreprocessingService.get_prepared_subject_data(model_spec, dataset_id, subject_id, source)
        probabilities, penultimate_embeddings = ModelRuntime.run_inference_with_embeddings(
            model_spec, subject_data.windows
        )
        response = build_inference_response(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            sampling_frequency=subject_data.sampling_frequency,
            prediction_ranges=subject_data.prediction_ranges,
            probabilities=probabilities,
        )
        remember(
            cls._inference_cache,
            (model_spec.name, dataset_id, subject_id, source, ModelRuntime.checkpoint_signature(model_spec)),
            response,
            cls._INFERENCE_CACHE_LIMIT,
        )

        source_dimension = int(penultimate_embeddings.shape[1]) if penultimate_embeddings.ndim == 2 else 0
        coordinates, explained_variance_ratio, reduction_status = reduce_embeddings_pca(penultimate_embeddings)
        cluster_ids = cluster_embeddings_density(penultimate_embeddings) if reduction_status == "ok" else []
        points = (
            [
                ModelWindowEmbeddingPoint(
                    window_index=prediction.window_index,
                    start_time=prediction.start_time,
                    end_time=prediction.end_time,
                    x=float(coordinate[0]),
                    y=float(coordinate[1]),
                    raw_embedding=[float(value) for value in embedding_row],
                    predicted_label=prediction.predicted_label,
                    confidence=prediction.confidence,
                    cluster_id=cluster_ids[index] if index < len(cluster_ids) else None,
                )
                for index, (prediction, coordinate, embedding_row) in enumerate(
                    zip(response.predictions, coordinates, penultimate_embeddings, strict=True)
                )
            ]
            if reduction_status == "ok"
            else []
        )

        return ModelWindowEmbeddingsResponse(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_spec.name,
            source=source,
            checkpoint_signature=ModelRuntime.checkpoint_signature(model_spec),
            embedding_layer="encoder",
            embedding_label="window penultimate embedding",
            feature_names=get_embedding_feature_names(source_dimension),
            reduction=ModelPatientEmbeddingReduction(
                method="pca",
                status=reduction_status,
                source_dimension=source_dimension,
                output_dimension=2 if reduction_status == "ok" else 0,
                explained_variance_ratio=explained_variance_ratio,
            ),
            points=points,
        )

    @classmethod
    def _infer_subject_result(
        cls,
        *,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource,
        model_name: str,
        include_penultimate_embedding: bool,
    ) -> ModelInferenceResult:
        validate_model_input_source(source)
        cls._ensure_inference_available()
        model_spec = cls._get_model_spec(model_name)
        checkpoint_signature = ModelRuntime.checkpoint_signature(model_spec)
        cache_key = (model_spec.name, dataset_id, subject_id, source, checkpoint_signature)
        cached_response = cls._inference_cache.get(cache_key)
        if cached_response is not None and not include_penultimate_embedding:
            cls._inference_cache.move_to_end(cache_key)
            return ModelInferenceResult(
                response=cached_response, mean_penultimate_embedding=[], penultimate_embeddings=[]
            )

        subject_data = SubjectPreprocessingService.get_prepared_subject_data(model_spec, dataset_id, subject_id, source)
        if include_penultimate_embedding:
            probabilities, penultimate_embeddings = ModelRuntime.run_inference_with_embeddings(
                model_spec, subject_data.windows
            )
        else:
            probabilities = ModelRuntime.run_inference(model_spec, subject_data.windows)
            penultimate_embeddings = np.empty((0, 0), dtype=float)

        response = build_inference_response(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            sampling_frequency=subject_data.sampling_frequency,
            prediction_ranges=subject_data.prediction_ranges,
            probabilities=probabilities,
        )
        remember(cls._inference_cache, cache_key, response, cls._INFERENCE_CACHE_LIMIT)

        mean_penultimate_embedding = (
            penultimate_embeddings.mean(axis=0).astype(float).ravel().tolist()
            if include_penultimate_embedding and penultimate_embeddings.size
            else []
        )
        window_penultimate_embeddings = (
            penultimate_embeddings.astype(float).tolist()
            if include_penultimate_embedding and penultimate_embeddings.size
            else []
        )
        return ModelInferenceResult(
            response=response,
            mean_penultimate_embedding=mean_penultimate_embedding,
            penultimate_embeddings=window_penultimate_embeddings,
        )

    @classmethod
    def compute_class_evidence(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
        window_index: int = 0,
        model_name: str = DEFAULT_MODEL_NAME,
    ) -> ModelClassEvidenceResponse:
        validate_model_input_source(source)
        cls._ensure_inference_available()
        model_spec = cls._get_model_spec(model_name)
        checkpoint_signature = ModelRuntime.checkpoint_signature(model_spec)
        cache_key = (model_spec.name, dataset_id, subject_id, source, window_index, checkpoint_signature)
        cached_response = cls._class_evidence_cache.get(cache_key)
        if cached_response is not None:
            cls._class_evidence_cache.move_to_end(cache_key)
            return cached_response

        subject_data = SubjectPreprocessingService.get_prepared_subject_data(model_spec, dataset_id, subject_id, source)
        validate_window_index(window_index, len(subject_data.prediction_ranges))
        response = compute_class_evidence_response(
            model_spec=model_spec,
            subject_data=subject_data,
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            window_index=window_index,
        )
        remember(cls._class_evidence_cache, cache_key, response, cls._CLASS_EVIDENCE_CACHE_LIMIT)
        return response

    @classmethod
    def get_class_weights(cls, model_name: str = DEFAULT_MODEL_NAME) -> ModelClassWeightsResponse:
        model_spec = cls._get_model_spec(model_name)
        checkpoint_signature = ModelRuntime.checkpoint_signature(model_spec)
        cache_key = f"{model_spec.name}:{checkpoint_signature}"
        cached_response = cls._class_weights_cache.get(cache_key)
        if cached_response is not None:
            cls._class_weights_cache.move_to_end(cache_key)
            return cached_response

        response = build_class_weights_response(model_spec)
        remember(cls._class_weights_cache, cache_key, response, cls._CLASS_WEIGHTS_CACHE_LIMIT)
        return response

    @classmethod
    def compute_band_power(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
        window_index: int = 0,
        model_name: str = DEFAULT_MODEL_NAME,
    ) -> ModelBandPowerResponse:
        validate_model_input_source(source)
        model_spec = cls._get_model_spec(model_name)
        cache_key = (model_spec.name, dataset_id, subject_id, source, window_index)
        cached_response = cls._band_power_cache.get(cache_key)
        if cached_response is not None:
            cls._band_power_cache.move_to_end(cache_key)
            return cached_response

        subject_data = SubjectPreprocessingService.get_prepared_subject_data(model_spec, dataset_id, subject_id, source)
        validate_window_index(window_index, len(subject_data.prediction_ranges))
        response = compute_band_power_response(
            subject_data=subject_data,
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            window_index=window_index,
        )
        remember(cls._band_power_cache, cache_key, response, cls._BAND_POWER_CACHE_LIMIT)
        return response

    @classmethod
    def compute_band_power_stats(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
        mode: Literal["intra_patient", "inter_patient"] = "intra_patient",
        model_name: str = DEFAULT_MODEL_NAME,
    ) -> ModelBandPowerStatsResponse:
        validate_model_input_source(source)
        model_spec = cls._get_model_spec(model_name)
        cache_key = (model_spec.name, dataset_id, subject_id, source, mode)
        cached_response = cls._band_power_stats_cache.get(cache_key)
        if cached_response is not None:
            cls._band_power_stats_cache.move_to_end(cache_key)
            return cached_response

        try:
            response = compute_band_power_stats_response(
                model_spec=model_spec,
                dataset_id=dataset_id,
                subject_id=subject_id,
                source=source,
                mode=mode,
            )
        except TimeseriesNotFoundError as exc:
            raise ModelNotFoundError(str(exc)) from exc
        except TimeseriesValidationError as exc:
            raise ModelValidationError(str(exc)) from exc
        except TimeseriesReaderUnavailableError as exc:
            raise ModelDependencyUnavailableError(str(exc)) from exc
        except TimeseriesServiceError as exc:
            raise ModelServiceError(str(exc)) from exc

        remember(cls._band_power_stats_cache, cache_key, response, cls._BAND_POWER_STATS_CACHE_LIMIT)
        return response

    @classmethod
    def get_scalp_topologies(cls, model_name: str = DEFAULT_MODEL_NAME) -> ModelScalpTopologyResponse:
        model_spec = cls._get_model_spec(model_name)
        checkpoint_signature = ModelRuntime.checkpoint_signature(model_spec)
        cache_key = f"{model_spec.name}:{checkpoint_signature}"
        cached_response = cls._scalp_topology_cache.get(cache_key)
        if cached_response is not None:
            cls._scalp_topology_cache.move_to_end(cache_key)
            return cached_response

        response = build_scalp_topology_response(model_spec)
        remember(cls._scalp_topology_cache, cache_key, response, cls._SCALP_TOPOLOGY_CACHE_LIMIT)
        return response

    @classmethod
    def compute_window_scalp_topologies(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
        window_index: int = 0,
        model_name: str = DEFAULT_MODEL_NAME,
    ) -> ModelWindowScalpTopologyResponse:
        validate_model_input_source(source)
        cls._ensure_inference_available()
        model_spec = cls._get_model_spec(model_name)
        checkpoint_signature = ModelRuntime.checkpoint_signature(model_spec)
        cache_key = (model_spec.name, dataset_id, subject_id, source, window_index, checkpoint_signature)
        cached_response = cls._window_scalp_topology_cache.get(cache_key)
        if cached_response is not None:
            cls._window_scalp_topology_cache.move_to_end(cache_key)
            return cached_response

        subject_data = SubjectPreprocessingService.get_prepared_subject_data(model_spec, dataset_id, subject_id, source)
        response = compute_window_scalp_topology_response(
            model_spec=model_spec,
            subject_data=subject_data,
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            window_index=window_index,
        )
        remember(cls._window_scalp_topology_cache, cache_key, response, cls._WINDOW_SCALP_TOPOLOGY_CACHE_LIMIT)
        return response

    @staticmethod
    def _get_model_spec(model_name: str) -> ModelSpec:
        try:
            return get_model_spec(model_name)
        except KeyError as exc:
            raise ModelNotFoundError(str(exc)) from exc

    @classmethod
    def _ensure_inference_available(cls) -> None:
        if not cls._CHECKPOINT_READY_FOR_INFERENCE:
            raise ModelInferenceUnavailableError(cls._CHECKPOINT_UNAVAILABLE_MESSAGE)
