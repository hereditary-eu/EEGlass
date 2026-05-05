from __future__ import annotations

from backend.ml.model_vars import PARAMETERS_DEFAULT


def build_xeegnet():
    from selfeeg.models import xEEGNet

    return xEEGNet(
        nb_classes=PARAMETERS_DEFAULT["nb_classes"],
        Chans=PARAMETERS_DEFAULT["Chans"],
        Samples=PARAMETERS_DEFAULT["sample_length"],
        Fs=PARAMETERS_DEFAULT["srate"],
        global_pooling=True,
    )
