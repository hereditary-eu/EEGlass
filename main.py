import os
import argparse
import logging

from backend.models.data_utils.load_data import load_metadata
from backend.models.data_utils.perpare_data import split_participants_min_per_class
from backend.models.train import train_save_model, load_model_weights
from backend.models.model_vars import PRETRAINED_MODEL_DIR
from backend.models.model_utils import load_model_weights


def main():
    print("Hello from All In One EEG!")
    print("This could be the potential CLI entrypoint (training, preprocessing, etc.)")

    # model, df_metadata = train()
    # model = load_model()


def train():
    """
    Trains the xeegmodel.
    Saves the model.
    """
    dir_data = os.path.join("data", "datasets", "ds004504")

    # probably add timestamp to the model name to keep track of different runs
    modelname = "xeegnet_model_v1.pt"
    model_path = PRETRAINED_MODEL_DIR / modelname

    df_metadata = load_metadata(dir_data=dir_data)
    participants_ids_train, participants_ids_val, participants_ids_test = split_participants_min_per_class(
        df_metadata, ratios=(0.6, 0.2, 0.2), id_col="participant_id_int", random_state=42
    )

    model, df_metadata = train_save_model(
        model_path=model_path,
        dir_data=dir_data,
        df_metadata=df_metadata,
        participant_ids_train=participants_ids_train,
        participant_ids_val=participants_ids_val,
        # n_max=1000,
    )
    return model, df_metadata


def load_model():
    modelname = "xeegnet_model_v1.pt"
    model_path = PRETRAINED_MODEL_DIR / modelname
    model = load_model_weights(model_path)
    return model


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser()
    parser.add_argument("action")
    args = parser.parse_args()

    if args.action == "train":
        train()
