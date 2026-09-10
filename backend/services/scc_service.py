"""Shared, model-independent SCC inputs and signal-level reference statistics."""

from collections import OrderedDict
from pathlib import Path
from threading import Lock

import numpy as np

from backend.config import CONFIG
from backend.ml.scc_cache import SCCParams, SCCStore, calc_mean_scc_per_channel
from backend.pydantic_models.scc import SCCResponse, SCCStatsResponse
from backend.services.model_errors import ModelNotFoundError, ModelServiceError, ModelValidationError


class SCCService:
    # All models and request/job threads share these locks and cached input arrays.
    _guard = Lock()
    _locks: dict[tuple, Lock] = {}
    _memory: OrderedDict = OrderedDict()

    @staticmethod
    def params(spec):
        return SCCParams(sfreq=float(spec.sampling_frequency), sample_length=spec.sample_length, bands=spec.scc_bands)

    @staticmethod
    def store():
        return SCCStore(Path(CONFIG.MODEL_OUTPUT_STORAGE_DIR).parent / "scc_cache")

    @classmethod
    def pairs(cls, spec, dataset_id, subject_id, source, windows):
        if spec.model_kind != "xeegnet_scc":
            raise ModelValidationError("This model has no SCC branch.")
        if windows.ndim != 3 or tuple(windows.shape[1:]) != (len(spec.channels), spec.sample_length):
            raise ModelValidationError("SCC windows do not match the model's channel count and sample length.")
        params = cls.params(spec)
        expected = (len(windows), len(spec.scc_bands), len(spec.channels) * (len(spec.channels) - 1) // 2)
        key = (dataset_id, subject_id, source, params.key(), expected)
        with cls._guard:
            lock = cls._locks.setdefault(key, Lock())
        with lock:
            with cls._guard:
                cached = cls._memory.get(key)
                if cached is not None:
                    cls._memory.move_to_end(key)
                    return cached
            store = cls.store()
            try:
                cached = store.get(dataset_id, subject_id, source, params)
            except OSError, ValueError:
                cached = None
            if cached is not None and (cached.shape != expected or not np.isfinite(cached).all()):
                cached = None
            try:
                if cached is None:
                    from backend.ml.scc_cache import compute_scc_windows

                    cached = compute_scc_windows(windows, params, len(spec.channels), n_jobs=1, chunk_size=32)
                    if cached.shape != expected or not np.isfinite(cached).all():
                        raise ValueError("SCC computation returned invalid values or dimensions.")
                    store.put(dataset_id, subject_id, source, cached, params, len(spec.channels), verbose=False)
            except Exception as exc:
                raise ModelServiceError(f"Could not compute spectral connectivity for {subject_id}: {exc}") from exc
            with cls._guard:
                cls._memory[key] = cached
                while len(cls._memory) > 16:
                    cls._memory.popitem(last=False)
            return cached

    @classmethod
    def subject_values(cls, spec, dataset_id, subject_id, source="derivatives"):
        from backend.services.model_service import SubjectPreprocessingService, validate_model_input_source

        validate_model_input_source(source)
        data = SubjectPreprocessingService.get_prepared_subject_data(spec, dataset_id, subject_id, source)
        pairs = cls.pairs(spec, dataset_id, subject_id, source, data.windows)
        return data, calc_mean_scc_per_channel(pairs, len(spec.channels))

    @classmethod
    def measurement(cls, spec, dataset_id, subject_id, source, window_index):
        from backend.services.model_service import validate_window_index

        data, values = cls.subject_values(spec, dataset_id, subject_id, source)
        validate_window_index(window_index, len(values))
        start, end = data.prediction_ranges[window_index]
        return SCCResponse(
            dataset_id=dataset_id,
            subject_id=subject_id,
            window_index=window_index,
            start_time=start,
            end_time=end,
            channels=[
                dict(
                    channel=c,
                    bands=[
                        dict(band=b, start_hz=lo, end_hz=hi, mean_coherence=float(values[window_index, bi, ci]))
                        for bi, (b, lo, hi) in enumerate(spec.scc_bands)
                    ],
                )
                for ci, c in enumerate(spec.channels)
            ],
        )

    @staticmethod
    def statistics_response(spec, dataset_id, subject_id, values, mode, cohort_label=None, window_count=None):
        mean, std = values.mean(axis=0), values.std(axis=0)
        return SCCStatsResponse(
            dataset_id=dataset_id,
            subject_id=subject_id,
            mode=mode,
            cohort_label=cohort_label,
            subject_count=1 if mode == "intra_patient" else len(values),
            window_count=len(values) if window_count is None else window_count,
            channels=[
                dict(
                    channel=c,
                    bands=[
                        dict(
                            band=b,
                            start_hz=lo,
                            end_hz=hi,
                            mean=float(mean[bi, ci]),
                            lower_2sigma=float(mean[bi, ci] - 2 * std[bi, ci]),
                            upper_2sigma=float(mean[bi, ci] + 2 * std[bi, ci]),
                            sample_count=len(values),
                        )
                        for bi, (b, lo, hi) in enumerate(spec.scc_bands)
                    ],
                )
                for ci, c in enumerate(spec.channels)
            ],
        )

    @classmethod
    def stats(cls, spec, dataset_id, subject_id, source, mode, cohort_label=None):
        if spec.model_kind != "xeegnet_scc":
            raise ModelValidationError("This model has no SCC branch.")
        if mode == "intra_patient":
            _, values = cls.subject_values(spec, dataset_id, subject_id, source)
            return cls.statistics_response(spec, dataset_id, subject_id, values, mode)
        from backend.services.prediction_cache_artifacts import read_prediction_artifact
        from backend.services.prediction_cache_service import PredictionCacheService

        status = PredictionCacheService.get_cache_status(dataset_id, spec.name, source)
        if status.status != "complete":
            raise ModelNotFoundError("Inter-patient SCC statistics require a completed dataset compute job.")
        if subject_id not in {s.subject_id for s in status.subject_summaries}:
            raise ModelNotFoundError(f"Subject '{subject_id}' was not found in this dataset.")
        if cohort_label and cohort_label not in {c.label for c in spec.classes}:
            raise ModelValidationError("Unknown reference cohort.")
        means, windows = [], 0
        for summary in status.subject_summaries:
            if cohort_label and summary.true_label != cohort_label:
                continue
            artifact = read_prediction_artifact(
                dataset_id, spec.name, status.checkpoint_key, summary.subject_id, source
            )
            if not artifact or "scc_stats" not in artifact:
                raise ModelNotFoundError("Run Compute all to prepare SCC reference statistics.")
            stats = SCCStatsResponse(**artifact["scc_stats"])
            means.append([[ch.bands[bi].mean for ch in stats.channels] for bi in range(len(spec.scc_bands))])
            windows += stats.window_count
        if not means:
            raise ModelNotFoundError("No patients are available in this reference cohort.")
        return cls.statistics_response(spec, dataset_id, subject_id, np.asarray(means), mode, cohort_label, windows)
