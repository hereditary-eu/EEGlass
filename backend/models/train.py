import selfeeg
import sys

# print sys paths
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
print(f"Root directory: {ROOT}")
sys.path.append(str(ROOT))

from backend.models.data_utils.load_data import *
from backend.models.data_utils.perpare_data import *
from backend.experiments_xeegnet.shallownetXAI_main.AllFnc.training import (
    lossBinary,
    lossMulti,
    train_model,
)

parameters_default = {
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

training_parameters_default = {
    # 'epochs': 5,
    "epochs": 100,
    "lr": 5 * 10 ** (-5),
    "gamma": 0.995,
    "seed": 42,
    # 'lossVal': None,
}

xeeg_model = selfeeg.models.xEEGNet(
    nb_classes=parameters_default["nb_classes"],
    Chans=parameters_default["Chans"],
    Samples=parameters_default["sample_length"],
    Fs=parameters_default["srate"],
    global_pooling=True,
)

participants_ids_all = list(np.arange(1, 89))
participants_ids_small = [1, 2, 3, 4, 5, 6, 40, 41, 42, 43, 44, 45, 80, 81, 82, 83, 84, 85]

participants_ids_train_debug = [1, 2, 40, 41, 80, 81]
participants_ids_val_debug = [3, 42, 82]
# participants_ids_val = []


def save_model(model, model_path, df_metadata=None):
    """
    Saves model and metadata if provided. Latter can be useful to keep track of train-val-test splits.
    """
    model.eval()
    model.to(device="cpu")
    torch.save(model.state_dict(), model_path)
    if df_metadata is not None:
        metadata_path = model_path.replace(".pt", "_metadata.csv")
        df_metadata.to_csv(metadata_path, index=True)


def train_save_model(
    model_path: str,
    dir_data: str,
    participant_ids_train: list = participants_ids_train_debug,
    participant_ids_val: list = participants_ids_val_debug,
    model=xeeg_model,
    parameters: dict = parameters_default,
    training_parameters: dict = training_parameters_default,
    verbose=False,
    device="cpu",
    df_metadata=None,
    n_max=None,
):
    """
    Trains the model and saves it to the specified path. The function loads the EEG data for the specified participants, prepares the data loaders, defines the optimizer, loss function and learning rate scheduler, and then trains the model using the train_model function from shallownetXAI_main. Finally, it saves the trained model to the specified path.
    There are default parameters for the model and training, which can be overridden.
    - model_path: Path to save the trained model.
    - dir_data: Path to the data directory containing the EEG data and metadata.
    - participant_ids_train: List of participant IDs to use for training.
    - participant_ids_val: List of participant IDs to use for validation.
    - model: The model to train (default is xeeg_model).
    - parameters: Dictionary of parameters for data preparation and model training (default is parameters_default).
    - training_parameters: Dictionary of parameters for training (default is training_parameters_default).
    - verbose: Whether to print verbose output during training (default is False).
    - device: Device to use for training (default is 'cpu').
    - df_metadata: Metadata dataframe (optional). If not provided, it will be loaded from the data directory.
    - n_max: Maximum number of samples to load per participant (default is None, i.e., load all samples). Only for debugging purposes to speed up training.
    """

    participant_ids_train_str = [gen_participant_id_long(pid) for pid in participant_ids_train]
    participant_ids_val_str = [gen_participant_id_long(pid) for pid in participant_ids_val]

    if df_metadata is None:
        df_metadata = load_metadata(dir_data)
        df_metadata.set_index("participant_id", inplace=True)
        df_metadata.loc[participant_ids_train_str, "datasplit"] = "train"
        df_metadata.loc[participant_ids_val_str, "datasplit"] = "val"

        # set the rest to test
        df_metadata["datasplit"] = df_metadata["datasplit"].fillna("test")

        # df_metadata = df_metadata.loc[df_metadata['datasplit'].isin(['train', 'val']), :]
        df_metadata.reset_index(inplace=True, drop=False)

    df_eeg = load_multiple_eegfiles(
        dir_data, participant_ids_train + participant_ids_val, gen_filename, df_metadata, n_max=n_max
    )

    if "participant_id" in df_eeg.columns:
        df_metadata.set_index("participant_id", inplace=True)

    df_train = df_eeg[df_eeg["participant_id"].isin(participant_ids_train_str)]
    df_val = df_eeg[df_eeg["participant_id"].isin(participant_ids_val_str)]

    trainloader = get_data_loader(
        df_train,
        parameters["Chans"],
        parameters["sample_length"],
        parameters["batchsize"],
        parameters["workers"],
        x_columns=parameters["x_columns"],
    )
    valloader = get_data_loader(
        df_val,
        parameters["Chans"],
        parameters["sample_length"],
        parameters["batchsize"],
        parameters["workers"],
        x_columns=parameters["x_columns"],
    )

    # define optimizer, loss function and learning rate scheduler
    optimizer = torch.optim.Adam(model.parameters(), lr=training_parameters["lr"])
    gamma = training_parameters["gamma"]
    scheduler = torch.optim.lr_scheduler.ExponentialLR(optimizer, gamma=gamma)
    if parameters["nb_classes"] > 2:
        lossFnc = lossMulti
    else:
        lossFnc = lossBinary

    earlystop = selfeeg.ssl.EarlyStopping(patience=15, min_delta=1e-04, record_best_weights=True)
    lossVal = None
    validation_loss_args = []

    print("Starting training...")
    print(f"Training parameters: {training_parameters}")
    print(f"xtrain shape: {len(trainloader.dataset)}, xval shape: {len(valloader.dataset)}")

    train_model(
        model=model,
        # model                 = xeegnet,
        train_dataloader=trainloader,
        epochs=training_parameters["epochs"],
        optimizer=optimizer,
        loss_func=lossFnc,
        lr_scheduler=scheduler,
        EarlyStopper=earlystop,
        validation_dataloader=valloader,
        validation_loss_func=lossVal,
        validation_loss_args=validation_loss_args,
        verbose=verbose,
        device=device,
        return_loss_info=True,
    )

    save_model(model, model_path, df_metadata=df_metadata)

    return model, df_metadata


def load_model_weights(model_path: str, model=xeeg_model, device="cpu"):
    """
    Loads a trained model from the specified path. The model has already to be defined, only loads the weights.
    - model_path: Path to the saved model.
    - model: The model architecture to load the weights into (default is xeeg_model).
    - device: Device to load the model onto (default is 'cpu').
    """
    print(f"Loading model from {model_path}")
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()
    return model


# model = train_save_model(
#     model_path=os.path.join('backend', 'models', 'pretrained_models', 'xeegnet_model_test.pt'),
#     dir_data=os.path.join('data', 'datasets', 'ds004504'),
#     n_max=1000,
# )
