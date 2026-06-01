from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import unittest

import numpy as np

from backend.ml.data_utils.load_data import (
    MICROVOLTS_SCALE,
    gen_model_input_filename,
    preprocessed_raw_to_windows,
    preprocess_raw_for_xeegnet,
)
from backend.ml.model_registry import is_model_input_protocol_current
from backend.ml.model_vars import MODEL_CHANNELS, MODEL_INPUT_PROTOCOL_VERSION, MODEL_INPUT_SOURCE, PARAMETERS_DEFAULT
from backend.services.model_errors import ModelValidationError
from backend.services.model_service import validate_model_input_source
from backend.services.prediction_cache_artifacts import PREPROCESSING_VERSION, is_manifest_valid


class FakeRaw:
    def __init__(self, data: np.ndarray, sfreq: float, ch_names: list[str] | None = None):
        self._data = np.asarray(data, dtype=np.float64)
        self.info = {"sfreq": float(sfreq)}
        self.ch_names = ch_names or list(MODEL_CHANNELS)
        self._update_times()

    def copy(self):
        return FakeRaw(self._data.copy(), float(self.info["sfreq"]), list(self.ch_names))

    def pick(self, channels):
        indices = [self.ch_names.index(channel) for channel in channels]
        self._data = self._data[indices]
        self.ch_names = list(channels)
        self._update_times()
        return self

    def load_data(self, verbose=None):
        return self

    def resample(self, sfreq, verbose=None):
        factor = int(round(float(self.info["sfreq"]) / float(sfreq)))
        self._data = self._data[:, ::factor]
        self.info["sfreq"] = float(sfreq)
        self._update_times()
        return self

    def get_data(self, picks=None, verbose=None):
        if picks is None:
            return self._data
        indices = [self.ch_names.index(channel) for channel in picks]
        return self._data[indices]

    @property
    def n_times(self):
        return int(self._data.shape[1])

    @property
    def times(self):
        return self._times

    def _update_times(self):
        self._times = np.arange(self._data.shape[1], dtype=np.float64) / float(self.info["sfreq"])


class DerivativeModelPipelineTest(unittest.TestCase):
    def test_model_input_path_uses_derivatives(self):
        self.assertEqual(
            gen_model_input_filename("001"),
            os.path.join("derivatives", "sub-001", "eeg", "sub-001_task-eyesclosed_eeg.set"),
        )

    def test_derivative_500hz_signal_downsamples_to_model_windows(self):
        data = np.arange(len(MODEL_CHANNELS) * 4000, dtype=np.float64).reshape(len(MODEL_CHANNELS), 4000)
        raw = FakeRaw(data, sfreq=500.0)

        model_raw = preprocess_raw_for_xeegnet(raw)
        windows, sampling_frequency, prediction_ranges = preprocessed_raw_to_windows(model_raw)

        self.assertEqual(sampling_frequency, 125.0)
        self.assertEqual(windows.shape, (2, len(MODEL_CHANNELS), 500))
        self.assertEqual(prediction_ranges, [(0.0, 4.0), (4.0, 8.0)])
        self.assertEqual(windows[0, 0, 0], data[0, 0] * MICROVOLTS_SCALE)
        self.assertEqual(windows[0, 0, 1], data[0, 4] * MICROVOLTS_SCALE)

    def test_model_source_rejects_raw(self):
        with self.assertRaises(ModelValidationError):
            validate_model_input_source("raw")

    def test_old_prediction_cache_manifest_is_invalid(self):
        manifest = {
            "preprocessing_version": "xeegnet-preprocessing-v3-band-power-stats",
            "dataset_id": "dataset",
            "model_name": "model",
            "source": "derivatives",
            "checkpoint_signature": "checkpoint",
            "checkpoint_key": "checkpoint-key",
        }

        self.assertNotEqual(PREPROCESSING_VERSION, manifest["preprocessing_version"])
        self.assertFalse(
            is_manifest_valid(
                manifest,
                dataset_id="dataset",
                model_name="model",
                source="derivatives",
                checkpoint_signature="checkpoint",
                checkpoint_key_value="checkpoint-key",
            )
        )

    def test_old_checkpoint_without_derivative_protocol_is_ignored(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            checkpoint_path = Path(temp_dir) / "xeegnet_model_v999.pt"
            checkpoint_path.write_bytes(b"not a real checkpoint")

            self.assertFalse(is_model_input_protocol_current(checkpoint_path))

            checkpoint_path.with_suffix(".model.json").write_text(
                json.dumps(
                    {
                        "input_source": MODEL_INPUT_SOURCE,
                        "input_protocol_version": MODEL_INPUT_PROTOCOL_VERSION,
                        "sampling_frequency": int(PARAMETERS_DEFAULT["srate"]),
                        "sample_length": int(PARAMETERS_DEFAULT["sample_length"]),
                        "window_size_seconds": float(PARAMETERS_DEFAULT["window"]),
                    }
                ),
                encoding="utf-8",
            )

            self.assertTrue(is_model_input_protocol_current(checkpoint_path))


if __name__ == "__main__":
    unittest.main()
