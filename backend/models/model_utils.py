import numpy as np
import torch
from backend.models.model_vars import (
    XEEG_MODEL_DEFAULT,
    # PARAMETERS_DEFAULT,
    # TRAINING_PARAMETERS_DEFAULT,
    # PRETRAINED_MODEL_DIR,
)


def inference(model, x: torch.Tensor | np.ndarray):
    """
    Runs inference on the model with the given input x.
    Args:
        model: The trained model to use for inference.
        x: The input data for inference (batchsize, Chans, sample_length)

    exmple usage:
    i = 0
    sample_length = 125 * 4  # srate * window
    batchsize = 1
    Chans = 19

    x_input = df_test.drop(columns=["time"]).iloc[i : i + sample_length][x_columns_input].values.astype(np.float32).T
    x_input = x_input.reshape(1, Chans, sample_length)

    out = inference(xeegnet, x_input)
    """
    model.eval()

    if isinstance(x, np.ndarray):
        x = torch.from_numpy(x).float()
    with torch.no_grad():
        out = model(x)
    return out


def load_model_weights(model_path: str, model=XEEG_MODEL_DEFAULT, device="cpu"):
    """
    Loads a trained model from the specified path. The model has already to be defined, only loads the weights.
    - model_path: Path to the saved model.
    - model: The model architecture to load the weights into (default is XEEG_MODEL_DEFAULT).
    - device: Device to load the model onto (default is 'cpu').
    """
    print(f"Loading model from {model_path}")
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()
    return model
