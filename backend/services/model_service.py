from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.integrate import trapezoid

from backend.ml.data_utils.load_data import preprocess_raw_for_xeegnet, preprocessed_raw_to_windows
from backend.ml.model import build_xeegnet
from backend.ml.model_registry import DEFAULT_MODEL_NAME, ModelSpec, get_model_spec
from backend.ml.model_vars import (
    MODEL_BANDS,
    MODEL_CHANNELS,
    MODEL_CLASS_LABELS,
    PARAMETERS_DEFAULT,
)
from backend.pydantic_models.inference import (
    ModelChannelBandPower,
    ModelBandPowerResponse,
    ModelBandPowerValue,
    ModelClassEvidenceBand,
    ModelClassEvidenceContribution,
    ModelClassEvidenceResponse,
    ModelInferenceResponse,
    ModelScalpTopologyBand,
    ModelScalpTopologyChannel,
    ModelScalpTopologyGrid,
    ModelScalpTopologyResponse,
    WindowPrediction,
)
from backend.pydantic_models.timeseries import TimeseriesSource
from backend.services.timeseries_service import (
    TimeseriesNotFoundError,
    TimeseriesReaderUnavailableError,
    TimeseriesService,
    TimeseriesServiceError,
    TimeseriesValidationError,
)


class ModelServiceError(Exception):
    pass


class ModelNotFoundError(ModelServiceError):
    pass


class ModelValidationError(ModelServiceError):
    pass


class ModelDependencyUnavailableError(ModelServiceError):
    pass


class ModelInferenceUnavailableError(ModelServiceError):
    pass


@dataclass
class PreparedSubjectData:
    windows: np.ndarray
    sampling_frequency: float
    prediction_ranges: list[tuple[float, float]]


class ModelService:
    _cached_models: dict[str, Any] = {}
    _cached_model_signatures: dict[str, str] = {}
    _CHECKPOINT_READY_FOR_INFERENCE = True
    _CHECKPOINT_UNAVAILABLE_MESSAGE = (
        "Inference is temporarily unavailable. The current pretrained checkpoint is incompatible with the corrected "
        "4-second preprocessing pipeline and must be retrained."
    )
    _SUBJECT_CACHE_LIMIT = 8
    _INFERENCE_CACHE_LIMIT = 16
    _CLASS_EVIDENCE_CACHE_LIMIT = 64
    _BAND_POWER_CACHE_LIMIT = 16
    _SCALP_TOPOLOGY_CACHE_LIMIT = 4
    _subject_data_cache: OrderedDict[tuple[str, str, str, TimeseriesSource], PreparedSubjectData] = OrderedDict()
    _inference_cache: OrderedDict[tuple[str, str, str, TimeseriesSource, str], ModelInferenceResponse] = OrderedDict()
    _class_evidence_cache: OrderedDict[
        tuple[str, str, str, TimeseriesSource, int, str],
        ModelClassEvidenceResponse,
    ] = OrderedDict()
    _band_power_cache: OrderedDict[tuple[str, str, str, TimeseriesSource, int], ModelBandPowerResponse] = OrderedDict()
    _scalp_topology_cache: OrderedDict[str, ModelScalpTopologyResponse] = OrderedDict()

    @classmethod
    def get_checkpoint_signature(cls, model_name: str = DEFAULT_MODEL_NAME) -> str:
        return cls._get_checkpoint_signature(cls._get_model_spec(model_name))

    @classmethod
    def get_model_spec(cls, model_name: str = DEFAULT_MODEL_NAME) -> ModelSpec:
        return cls._get_model_spec(model_name)

    @classmethod
    def infer_subject(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
        model_name: str = DEFAULT_MODEL_NAME,
    ) -> ModelInferenceResponse:
        if not cls._CHECKPOINT_READY_FOR_INFERENCE:
            raise ModelInferenceUnavailableError(cls._CHECKPOINT_UNAVAILABLE_MESSAGE)

        model_spec = cls._get_model_spec(model_name)
        checkpoint_signature = cls._get_checkpoint_signature(model_spec)
        cache_key = (model_spec.name, dataset_id, subject_id, source, checkpoint_signature)
        cached_response = cls._inference_cache.get(cache_key)
        if cached_response is not None:
            cls._inference_cache.move_to_end(cache_key)
            return cached_response

        subject_data = cls._get_prepared_subject_data(model_spec, dataset_id, subject_id, source)
        probabilities = cls._run_inference(model_spec, subject_data.windows)
        response = cls._build_inference_response(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            sampling_frequency=subject_data.sampling_frequency,
            prediction_ranges=subject_data.prediction_ranges,
            probabilities=probabilities,
        )
        cls._remember(cls._inference_cache, cache_key, response, cls._INFERENCE_CACHE_LIMIT)
        return response

    @classmethod
    def compute_class_evidence(
        cls,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource = "derivatives",
        window_index: int = 0,
        model_name: str = DEFAULT_MODEL_NAME,
    ) -> ModelClassEvidenceResponse:
        if not cls._CHECKPOINT_READY_FOR_INFERENCE:
            raise ModelInferenceUnavailableError(cls._CHECKPOINT_UNAVAILABLE_MESSAGE)

        model_spec = cls._get_model_spec(model_name)
        checkpoint_signature = cls._get_checkpoint_signature(model_spec)
        cache_key = (model_spec.name, dataset_id, subject_id, source, window_index, checkpoint_signature)
        cached_response = cls._class_evidence_cache.get(cache_key)
        if cached_response is not None:
            cls._class_evidence_cache.move_to_end(cache_key)
            return cached_response

        subject_data = cls._get_prepared_subject_data(model_spec, dataset_id, subject_id, source)
        cls._validate_window_index(window_index, len(subject_data.prediction_ranges))

        torch_module = cls._import_torch()
        model = cls._get_model(torch_module, model_spec)
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

        response = ModelClassEvidenceResponse(
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
        cls._remember(cls._class_evidence_cache, cache_key, response, cls._CLASS_EVIDENCE_CACHE_LIMIT)
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
        model_spec = cls._get_model_spec(model_name)
        cache_key = (model_spec.name, dataset_id, subject_id, source, window_index)
        cached_response = cls._band_power_cache.get(cache_key)
        if cached_response is not None:
            cls._band_power_cache.move_to_end(cache_key)
            return cached_response

        subject_data = cls._get_prepared_subject_data(model_spec, dataset_id, subject_id, source)
        cls._validate_window_index(window_index, len(subject_data.prediction_ranges))
        window_data = subject_data.windows[window_index].astype(np.float64, copy=False)
        window_data -= np.mean(window_data, axis=1, keepdims=True)

        sample_count = window_data.shape[1]
        if sample_count < 2:
            raise ModelValidationError("Recording is too short to compute band power.")

        window = np.hanning(sample_count)
        window_norm = np.sum(window**2)
        if window_norm <= 0:
            raise ModelServiceError("Could not compute band power due to invalid window normalization.")

        freqs = np.fft.rfftfreq(sample_count, d=1.0 / subject_data.sampling_frequency)
        channel_band_powers: list[ModelChannelBandPower] = []
        for channel_name, channel_signal in zip(MODEL_CHANNELS, window_data, strict=True):
            spectrum = np.fft.rfft(channel_signal * window)
            channel_psd = (np.abs(spectrum) ** 2) / (subject_data.sampling_frequency * window_norm)
            total_mask = (freqs >= MODEL_BANDS[0][1]) & (freqs <= MODEL_BANDS[-1][2])
            total_power = float(trapezoid(channel_psd[total_mask], freqs[total_mask])) if np.any(total_mask) else 0.0
            safe_total_power = total_power if total_power > 0 else 1.0
            channel_band_powers.append(
                ModelChannelBandPower(
                    channel=channel_name,
                    bands=[
                        ModelBandPowerValue(
                            band=band_name,
                            start_hz=start_hz,
                            end_hz=end_hz,
                            absolute_power=band_power,
                            relative_power=band_power / safe_total_power,
                        )
                        for band_name, start_hz, end_hz, band_power in cls._iterate_band_powers(freqs, channel_psd)
                    ],
                )
            )
        start_time, end_time = subject_data.prediction_ranges[window_index]

        response = ModelBandPowerResponse(
            dataset_id=dataset_id,
            subject_id=subject_id,
            source=source,
            window_index=window_index,
            start_time=start_time,
            end_time=end_time,
            sampling_frequency=subject_data.sampling_frequency,
            channels=channel_band_powers,
        )
        cls._remember(cls._band_power_cache, cache_key, response, cls._BAND_POWER_CACHE_LIMIT)
        return response

    @classmethod
    def get_scalp_topologies(cls, model_name: str = DEFAULT_MODEL_NAME) -> ModelScalpTopologyResponse:
        model_spec = cls._get_model_spec(model_name)
        checkpoint_signature = cls._get_checkpoint_signature(model_spec)
        cache_key = f"{model_spec.name}:{checkpoint_signature}"
        cached_response = cls._scalp_topology_cache.get(cache_key)
        if cached_response is not None:
            cls._scalp_topology_cache.move_to_end(cache_key)
            return cached_response

        torch_module = cls._import_torch()
        model = cls._get_model(torch_module, model_spec)
        conv2_weights = model.encoder.conv2.weight.detach().cpu().numpy().squeeze(1).squeeze(-1)
        grid_resolution = 72
        channel_positions, grid_x, grid_y, interpolated_band_values = cls._compute_mne_topology_grid(
            conv2_weights,
            grid_resolution,
        )
        topology_values = [conv2_weights.ravel()]
        topology_values.extend(interpolated_values.ravel() for interpolated_values in interpolated_band_values)
        global_values = np.concatenate(topology_values) if topology_values else np.array([], dtype=float)
        global_min_weight = float(np.min(global_values)) if global_values.size else 0.0
        global_max_weight = float(np.max(global_values)) if global_values.size else 0.0

        response = ModelScalpTopologyResponse(
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
        cls._remember(cls._scalp_topology_cache, cache_key, response, cls._SCALP_TOPOLOGY_CACHE_LIMIT)
        return response

    @staticmethod
    def _compute_mne_topology_grid(weights: np.ndarray, resolution: int):
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

    @classmethod
    def _get_prepared_subject_data(
        cls,
        model_spec: ModelSpec,
        dataset_id: str,
        subject_id: str,
        source: TimeseriesSource,
    ) -> PreparedSubjectData:
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
        cls._remember(cls._subject_data_cache, cache_key, subject_data, cls._SUBJECT_CACHE_LIMIT)
        return subject_data

    @classmethod
    def _build_inference_response(
        cls,
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

    @classmethod
    def _open_raw(cls, dataset_id: str, subject_id: str, source: TimeseriesSource):
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

    @staticmethod
    def _get_model_spec(model_name: str) -> ModelSpec:
        try:
            return get_model_spec(model_name)
        except KeyError as exc:
            raise ModelNotFoundError(str(exc)) from exc

    @classmethod
    def _run_inference(cls, model_spec: ModelSpec, windows: np.ndarray) -> np.ndarray:
        torch_module = cls._import_torch()
        model = cls._get_model(torch_module, model_spec)
        batch = torch_module.tensor(windows, dtype=torch_module.float32)

        with torch_module.no_grad():
            logits = model(batch)
            probabilities = torch_module.softmax(logits, dim=1)

        return probabilities.detach().cpu().numpy()

    @classmethod
    def _get_model(cls, torch_module, model_spec: ModelSpec):
        checkpoint_signature = cls._get_checkpoint_signature(model_spec)
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

    @classmethod
    def _get_checkpoint_signature(cls, model_spec: ModelSpec) -> str:
        checkpoint_path = model_spec.checkpoint_path.resolve()
        if not checkpoint_path.is_file():
            raise ModelServiceError(f"Pretrained model weights were not found at '{checkpoint_path}'.")
        stat = checkpoint_path.stat()
        return f"{checkpoint_path}:{stat.st_mtime_ns}:{stat.st_size}"

    @staticmethod
    def _iterate_band_powers(freqs: np.ndarray, mean_psd: np.ndarray):
        for band_name, start_hz, end_hz in MODEL_BANDS:
            band_mask = (freqs >= start_hz) & (freqs < end_hz if band_name != MODEL_BANDS[-1][0] else freqs <= end_hz)
            if not np.any(band_mask):
                yield band_name, start_hz, end_hz, 0.0
                continue

            band_power = float(trapezoid(mean_psd[band_mask], freqs[band_mask]))
            yield band_name, start_hz, end_hz, band_power

    @staticmethod
    def _remember(cache: OrderedDict, key, value, limit: int) -> None:
        cache[key] = value
        cache.move_to_end(key)
        while len(cache) > limit:
            cache.popitem(last=False)

    @staticmethod
    def _validate_window_index(window_index: int, window_count: int) -> None:
        if window_index < 0:
            raise ModelValidationError("window_index must be greater than or equal to 0.")
        if window_index >= window_count:
            raise ModelValidationError(
                f"window_index must be less than the number of available prediction windows ({window_count})."
            )

    @staticmethod
    def _import_torch():
        try:
            import torch
        except ImportError as exc:
            raise ModelDependencyUnavailableError(
                "PyTorch is required for model inference but is not available in the active Python environment."
            ) from exc

        return torch
