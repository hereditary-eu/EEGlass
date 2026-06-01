from pathlib import Path

PRETRAINED_MODEL_DIR = Path(__file__).resolve().parent / "pretrained_models"

DEFAULT_MODEL_NAME = "xeegnet_model_v200"  # 200-204 for different train/val/test splits

DEFAULT_FEATURE_IMPORTANCE_METHOD = "shap"
DEFAULT_FEATURE_IMPORTANCE_BACKEND_MODEL = "xgboost"

PARAMETERS_DEFAULT = {
    "nb_classes": 3,
    "x_columns": [
        "time",
        "Fp1",
        "Fp2",
        "F3",
        "F4",
        "C3",
        "C4",
        "P3",
        "P4",
        "O1",
        "O2",
        "F7",
        "F8",
        "T3",
        "T4",
        "T5",
        "T6",
        "Fz",
        "Cz",
        "Pz",
    ],
    "Chans": 19,
    "sample_length": 500,
    "srate": 125,
    "batchsize": 64,
    "workers": 0,
    "window": 4,  # in seconds
}

TRAINING_PARAMETERS_DEFAULT = {
    # 'epochs': 5,
    "epochs": 100,
    "lr": 5 * 10 ** (-5),
    "gamma": 0.995,
    "seed": 42,
    # 'lossVal': None,
}
MODEL_CHANNELS = tuple(PARAMETERS_DEFAULT["x_columns"][1:])
MODEL_CLASS_LABELS = {
    0: "Healthy",
    1: "Alzheimer Disease",
    2: "Frontotemporal Dementia",
}
MODEL_CLASS_LABEL_ALIASES = {
    "Alzheimer": "Alzheimer Disease",
}


def normalize_model_class_label(label: str | None) -> str | None:
    if label is None:
        return None
    return MODEL_CLASS_LABEL_ALIASES.get(label, label)


MODEL_BANDS = (
    ("delta", 0.5, 4.0),
    ("theta", 4.0, 8.0),
    ("alpha", 8.0, 12.0),
    ("beta1", 12.0, 16.0),
    ("beta2", 16.0, 20.0),
    ("beta3", 20.0, 28.0),
    ("gamma", 28.0, 45.0),
)

MODEL_BAND_ACTIVATION_FEATURE_NAMES = tuple(f"{band_name} activation" for band_name, _, _ in MODEL_BANDS)


def get_embedding_feature_names(dimension: int) -> list[str]:
    band_feature_names = list(MODEL_BAND_ACTIVATION_FEATURE_NAMES[:dimension])
    if dimension > len(band_feature_names):
        band_feature_names.extend(
            f"Feature {index + 1}" for index in range(len(band_feature_names), dimension)
        )
    return band_feature_names
