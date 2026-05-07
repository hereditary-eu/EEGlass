from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from backend.ml.model_vars import (
    MODEL_BANDS,
    MODEL_CHANNELS,
    PARAMETERS_DEFAULT,
    PRETRAINED_MODEL_PATH,
)


@dataclass(frozen=True)
class ModelSpec:
    name: str
    display_name: str
    architecture: str
    checkpoint_path: Path
    channels: tuple[str, ...]
    bands: tuple[tuple[str, float, float], ...]
    sampling_frequency: int
    sample_length: int
    window_size_seconds: float


DEFAULT_MODEL_NAME = "xeegnet-v1"

MODEL_REGISTRY: dict[str, ModelSpec] = {
    DEFAULT_MODEL_NAME: ModelSpec(
        name=DEFAULT_MODEL_NAME,
        display_name="xEEGNet v1",
        architecture="xEEGNet",
        checkpoint_path=PRETRAINED_MODEL_PATH,
        channels=MODEL_CHANNELS,
        bands=MODEL_BANDS,
        sampling_frequency=int(PARAMETERS_DEFAULT["srate"]),
        sample_length=int(PARAMETERS_DEFAULT["sample_length"]),
        window_size_seconds=float(PARAMETERS_DEFAULT["window"]),
    ),
}


def get_model_spec(model_name: str) -> ModelSpec:
    try:
        return MODEL_REGISTRY[model_name]
    except KeyError as exc:
        known_models = ", ".join(sorted(MODEL_REGISTRY)) or "none"
        raise KeyError(f"Unknown model '{model_name}'. Available models: {known_models}.") from exc
