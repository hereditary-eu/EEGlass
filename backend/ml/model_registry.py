from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

from backend.ml.model_vars import (
    MODEL_BANDS,
    MODEL_CHANNELS,
    MODEL_CLASS_LABELS,
    PARAMETERS_DEFAULT,
    PRETRAINED_MODEL_DIR,
)


@dataclass(frozen=True)
class ModelClassSpec:
    class_id: int
    label: str
    compact_label: str


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
    classes: tuple[ModelClassSpec, ...]


MODEL_CHECKPOINT_PATTERN = re.compile(r"^xeegnet_model_v\d+\.pt$")

DEFAULT_MODEL_CLASSES = tuple(
    ModelClassSpec(
        class_id=class_id,
        label=label,
        compact_label={
            "Healthy": "H",
            "Alzheimer Disease": "AD",
            "Frontotemporal Dementia": "FTD",
        }.get(label, label),
    )
    for class_id, label in MODEL_CLASS_LABELS.items()
)


def build_xeegnet_model_spec(model_name: str, checkpoint_filename: str) -> ModelSpec:
    return ModelSpec(
        name=model_name,
        display_name=f"xEEGNet {model_name.removeprefix('xeegnet_model_').removeprefix('xeegnet-')}",
        architecture="xEEGNet",
        checkpoint_path=PRETRAINED_MODEL_DIR / checkpoint_filename,
        channels=MODEL_CHANNELS,
        bands=MODEL_BANDS,
        sampling_frequency=int(PARAMETERS_DEFAULT["srate"]),
        sample_length=int(PARAMETERS_DEFAULT["sample_length"]),
        window_size_seconds=float(PARAMETERS_DEFAULT["window"]),
        classes=DEFAULT_MODEL_CLASSES,
    )


def discover_xeegnet_checkpoints() -> dict[str, str]:
    return {
        checkpoint_path.stem: checkpoint_path.name
        for checkpoint_path in sorted(PRETRAINED_MODEL_DIR.glob("*.pt"))
        if MODEL_CHECKPOINT_PATTERN.match(checkpoint_path.name)
    }


MODEL_REGISTRY: dict[str, ModelSpec] = {
    model_name: build_xeegnet_model_spec(model_name, checkpoint_filename)
    for model_name, checkpoint_filename in discover_xeegnet_checkpoints().items()
}


def get_model_spec(model_name: str) -> ModelSpec:
    try:
        return MODEL_REGISTRY[model_name]
    except KeyError as exc:
        known_models = ", ".join(sorted(MODEL_REGISTRY)) or "none"
        raise KeyError(f"Unknown model '{model_name}'. Available models: {known_models}.") from exc


def list_model_specs() -> tuple[ModelSpec, ...]:
    return tuple(MODEL_REGISTRY[model_name] for model_name in sorted(MODEL_REGISTRY))
