from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from backend.ml.model_vars import (
    MODEL_BANDS,
    MODEL_CHANNELS,
    MODEL_CLASS_LABELS,
    PARAMETERS_DEFAULT,
    PRETRAINED_MODEL_PATH,
)


@dataclass(frozen=True)
class ModelClassColors:
    annotation: str
    distribution: str
    embedding_fill: str
    embedding_stroke: str


@dataclass(frozen=True)
class ModelClassSpec:
    class_id: int
    label: str
    compact_label: str
    colors: ModelClassColors


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


DEFAULT_MODEL_NAME = "xeegnet-v1"

DEFAULT_MODEL_CLASSES = tuple(
    ModelClassSpec(
        class_id=class_id,
        label=label,
        compact_label={
            "Healthy": "H",
            "Alzheimer": "Alz",
            "Frontotemporal Dementia": "FTD",
        }.get(label, label),
        colors={
            "Healthy": ModelClassColors(
                annotation="rgb(21 128 61 / 22%)",
                distribution="rgb(21 128 61 / 32%)",
                embedding_fill="rgb(21 128 61 / 22%)",
                embedding_stroke="#15803d",
            ),
            "Alzheimer": ModelClassColors(
                annotation="rgb(225 29 72 / 28%)",
                distribution="rgb(225 29 72 / 34%)",
                embedding_fill="rgb(225 29 72 / 22%)",
                embedding_stroke="#be123c",
            ),
            "Frontotemporal Dementia": ModelClassColors(
                annotation="#c2ddfc",
                distribution="#c2ddfc",
                embedding_fill="rgb(37 99 235 / 20%)",
                embedding_stroke="#2563eb",
            ),
        }[label],
    )
    for class_id, label in MODEL_CLASS_LABELS.items()
)

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
        classes=DEFAULT_MODEL_CLASSES,
    ),
}


def get_model_spec(model_name: str) -> ModelSpec:
    try:
        return MODEL_REGISTRY[model_name]
    except KeyError as exc:
        known_models = ", ".join(sorted(MODEL_REGISTRY)) or "none"
        raise KeyError(f"Unknown model '{model_name}'. Available models: {known_models}.") from exc
