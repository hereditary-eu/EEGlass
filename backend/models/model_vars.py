from pathlib import Path
from selfeeg.models import xEEGNet

PRETRAINED_MODEL_DIR = Path("backend", "models", "pretrained_models")

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

XEEG_MODEL_DEFAULT = xEEGNet(
    nb_classes=PARAMETERS_DEFAULT["nb_classes"],
    Chans=PARAMETERS_DEFAULT["Chans"],
    Samples=PARAMETERS_DEFAULT["sample_length"],
    Fs=PARAMETERS_DEFAULT["srate"],
    global_pooling=True,
)
