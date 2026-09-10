from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from backend.ml.model_vars import (
    MODEL_BANDS,
    MODEL_CHANNELS,
    MODEL_CLASS_LABELS,
    PARAMETERS_DEFAULT,
    PRETRAINED_MODEL_DIR,
)
from backend.ml.scc_cache import DEFAULT_BANDS as SCC_BANDS


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
    model_kind: Literal["xeegnet", "xeegnet_scc"] = "xeegnet"
    scc_reducer: Literal["node"] | None = None
    scc_bands: tuple[tuple[str, float, float], ...] = ()
    split_index: int = 0

    @property
    def feature_names(self) -> list[str]:
        if self.model_kind == "xeegnet_scc":
            return [f"BP {b} activation" for b, _, _ in self.bands] + [
                f"SCC {b} activation" for b, _, _ in self.scc_bands
            ]
        return [f"{b} activation" for b, _, _ in self.bands]

    @property
    def embedding_layer(self) -> str:
        return "Dense.input" if self.model_kind == "xeegnet_scc" else "encoder"


MODEL_CHECKPOINT_PATTERN = re.compile(r"^xeegnet_(?:model|scc_model_reducermode_node)_v(20[0-4])\.pt$")

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
    is_scc = checkpoint_filename.startswith("xeegnet_scc_")
    version = int(checkpoint_filename.rsplit("_v", 1)[1].removesuffix(".pt"))
    return ModelSpec(
        name=model_name,
        display_name=f"xEEGNet{' + SCC · Node' if is_scc else ''} v{version}",
        architecture="xEEGNet + SCC" if is_scc else "xEEGNet",
        model_kind="xeegnet_scc" if is_scc else "xeegnet",
        scc_reducer="node" if is_scc else None,
        scc_bands=SCC_BANDS if is_scc else (),
        split_index=version - 200,
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
