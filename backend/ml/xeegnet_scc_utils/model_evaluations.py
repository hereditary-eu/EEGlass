import numpy as np
import pandas as pd
import torch
from pathlib import Path

from torch.utils.data import DataLoader
from backend.ml.scc_cache import SCCStore, SCCParams, build_x_y_scc, CachedSCCDataset, SCCReducer, pairs_to_dense
from backend.ml.data_utils.load_data import load_multiple_eeg_windows_inner
from backend.ml.data_utils.prepare_data import get_window_data_loader


__all__ = [
    "get_dataloaders_xysubjectids",
    "split_data",
    "generate_model_name",
    "MODEL_PREFIXES_BIB",
    "filter_results_dataframe",
    "adapt_data_for_task",
    "generate_model_path",
]

MODEL_PREFIXES_BIB = {"xeegnet": "xeegnet_model", "xeegnet_scc": "xeegnet_scc_model"}


def generate_model_name(
    model_kind: str, model_version: int, n_max: int | None = None, reducer_mode_scc: str | None = None
) -> str:

    model_prefix = MODEL_PREFIXES_BIB[model_kind]

    if model_kind == "xeegnet_scc":
        if reducer_mode_scc in ["node", "edge"]:
            model_name = f"{model_prefix}_reducermode_{reducer_mode_scc}_v{model_version}.pt"
        elif reducer_mode_scc == "mean":
            model_name = f"{model_prefix}_v{model_version}.pt"
        else:
            raise ValueError(f"Unsupported reducer_mode_scc: {reducer_mode_scc}")
    elif model_kind == "xeegnet":
        model_name = f"{model_prefix}_v{model_version}.pt"

    if n_max is not None:
        raise ValueError("n_max is not supported in generate_model_name yet.")

    return model_name


def get_dataloaders_xysubjectids(
    dir_data: str,
    participant_ids_train: list[int],
    participant_ids_val: list[int],
    participant_ids_test: list[int],
    df_metadata: pd.DataFrame,
    parameters: dict,
    n_max: int = None,
    use_cached_scc: bool = False,
    store: SCCStore | None = None,
    scc_params: SCCParams | None = None,
    dataset_id: str | None = None,
    n_channels: int | None = None,
    source: str = "derivatives",
    load_model_windows_for_participant=None,
    print_info: bool = False,
    shuffle_train: bool = True,
    data_x_y_id: tuple[np.ndarray, np.ndarray, np.ndarray] | None = None,
    data_x_y_scc_id: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray] | None = None,
):
    """
    Get dataloaders for training, validation, and testing, along with the corresponding data arrays and subject IDs.
    Returns:
        trainloader: DataLoader for training data
        valloader: DataLoader for validation data
        testloader: DataLoader for testing data
        xy_subjects: Tuple containing the data arrays and subject IDs for training, validation, and testing
        xy_subjects is either:
        (x_train, y_train, subject_ids_train,
         x_val, y_val, subject_ids_val,
         x_test, y_test, subject_ids_test)
        or, if use_cached_scc is True:
        (x_train, y_train, subject_ids_train, scc_train,
         x_val, y_val, subject_ids_val, scc_val,
         x_test, y_test, subject_ids_test, scc_test)
    """
    if data_x_y_id is None and data_x_y_scc_id is not None:
        data_x, data_y, data_scc, data_subject_ids = data_x_y_scc_id
        data_x_y_id = (data_x, data_y, data_subject_ids)

    if data_x_y_id is None:
        data_x, data_y, data_subject_ids = load_multiple_eeg_windows_inner(
            dir_data,
            participant_ids_train + participant_ids_val + participant_ids_test,
            df_metadata,
            sample_length=parameters["sample_length"],
            n_max=n_max,
        )
    else:
        data_x, data_y, data_subject_ids = data_x_y_id

    if not use_cached_scc:
        (
            x_train,
            y_train,
            subject_ids_train,
            x_val,
            y_val,
            subject_ids_val,
            x_test,
            y_test,
            subject_ids_test,
        ) = split_data(
            data_x,
            data_y,
            data_subject_ids,
            participant_ids_train,
            participant_ids_val,
            participant_ids_test,
        )

        trainloader = get_window_data_loader(
            x_train, y_train, parameters["batchsize"], parameters["workers"], shuffle=shuffle_train
        )
        valloader = get_window_data_loader(
            x_val,
            y_val,
            parameters["batchsize"],
            parameters["workers"],
            shuffle=False,
        )
        testloader = get_window_data_loader(
            x_test,
            y_test,
            parameters["batchsize"],
            parameters["workers"],
            shuffle=False,
        )

        xy_subjects = (
            x_train,
            y_train,
            subject_ids_train,
            x_val,
            y_val,
            subject_ids_val,
            x_test,
            y_test,
            subject_ids_test,
        )

    else:
        if (
            store is None
            or scc_params is None
            or dataset_id is None
            or n_channels is None
            or load_model_windows_for_participant is None
        ):
            raise ValueError(
                "use_cached_scc=True requires store, scc_params, dataset_id, n_channels, and load_model_windows_for_participant."
            )

        if data_x_y_scc_id is None:
            df = df_metadata.copy()
            label_of = {f"sub-{int(r.participant_id.split('-')[1]):03d}": int(r.group_encoded) for r in df.itertuples()}
            data_x, data_y, data_scc, data_subject_ids = build_x_y_scc(
                dir_data,
                participant_ids_train + participant_ids_val + participant_ids_test,
                label_of,
                store,
                scc_params,
                load_model_windows_for_participant,
                dataset_id=dataset_id,
                n_channels=n_channels,
                source=source,
                sample_length=parameters["sample_length"],
                n_jobs=1,
                print_info=print_info,
            )
        else:
            data_x, data_y, data_scc, data_subject_ids = data_x_y_scc_id

        (
            x_train,
            y_train,
            subject_ids_train,
            scc_train,
            x_val,
            y_val,
            subject_ids_val,
            scc_val,
            x_test,
            y_test,
            subject_ids_test,
            scc_test,
        ) = split_data(
            data_x,
            data_y,
            data_subject_ids,
            participant_ids_train,
            participant_ids_val,
            participant_ids_test,
            scc=data_scc,
        )

        trainloader = DataLoader(
            CachedSCCDataset(x_train, scc_train, y_train),
            batch_size=parameters["batchsize"],
            shuffle=shuffle_train,
            num_workers=parameters["workers"],
        )
        valloader = DataLoader(
            CachedSCCDataset(x_val, scc_val, y_val),
            batch_size=parameters["batchsize"],
            shuffle=False,
            num_workers=parameters["workers"],
        )
        testloader = DataLoader(
            CachedSCCDataset(x_test, scc_test, y_test),
            batch_size=parameters["batchsize"],
            shuffle=False,
            num_workers=parameters["workers"],
        )

        xy_subjects = (
            x_train,
            y_train,
            subject_ids_train,
            scc_train,
            x_val,
            y_val,
            subject_ids_val,
            scc_val,
            x_test,
            y_test,
            subject_ids_test,
            scc_test,
        )

    return trainloader, valloader, testloader, xy_subjects


def split_data(
    x: np.ndarray,
    y: np.ndarray,
    subject_ids: np.ndarray,
    participant_ids_train: list[int],
    participant_ids_val: list[int],
    participant_ids_test: list[int],
    scc: np.ndarray | None = None,
):
    """
    Split aligned arrays by participant ids.
    If scc is given, it is split with the same masks.
    """
    train_mask = np.isin(subject_ids, participant_ids_train)
    val_mask = np.isin(subject_ids, participant_ids_val)
    test_mask = np.isin(subject_ids, participant_ids_test)

    x_train, y_train, subject_ids_train = x[train_mask], y[train_mask], subject_ids[train_mask]
    x_val, y_val, subject_ids_val = x[val_mask], y[val_mask], subject_ids[val_mask]
    x_test, y_test, subject_ids_test = x[test_mask], y[test_mask], subject_ids[test_mask]

    if scc is None:
        return (
            x_train,
            y_train,
            subject_ids_train,
            x_val,
            y_val,
            subject_ids_val,
            x_test,
            y_test,
            subject_ids_test,
        )

    scc_train = scc[train_mask]
    scc_val = scc[val_mask]
    scc_test = scc[test_mask]

    return (
        x_train,
        y_train,
        subject_ids_train,
        scc_train,
        x_val,
        y_val,
        subject_ids_val,
        scc_val,
        x_test,
        y_test,
        subject_ids_test,
        scc_test,
    )


def filter_results_dataframe(df, task=None, model_kind=None, reducer_mode_scc=None, datasplit=None, aggregation=None):
    """Filter the DataFrame based on the provided criteria."""
    if task is not None:
        df = df[df["task"] == task]
    if model_kind is not None:
        df = df[df["model_kind"] == model_kind]
    if reducer_mode_scc is not None:
        df = df[df["reducer_mode_scc"] == reducer_mode_scc]
    if datasplit is not None:
        df = df[df["datasplit"] == datasplit]
    if aggregation is not None:
        df = df[df["aggregation"] == aggregation]
    return df


def adapt_data_for_task(data_x_y_scc_id, task):
    """Filter subjects and remap labels for a classification task.
    SCC is label-independent, so this only subsets rows — no recompute."""
    x, y, scc, sids = data_x_y_scc_id

    if task == "three_class":
        return x.copy(), y.copy(), scc.copy(), sids.copy()

    if task == "cn_ad":
        mask = np.isin(y, [0, 1])
        y_new = np.where(y[mask] == 1, 1, 0)  # AD -> 1, CN -> 0
    elif task == "cn_ftd":
        mask = np.isin(y, [0, 2])
        y_new = np.where(y[mask] == 2, 1, 0)  # FTD -> 1, CN -> 0
    elif task == "cn_disease":
        mask = np.ones(len(y), dtype=bool)  # keep all
        y_new = (y[mask] > 0).astype(int)  # any dementia -> 1
    else:
        raise ValueError(f"Unsupported task: {task}")

    y_new = y_new.astype("float32")  # BCE-with-logits needs float
    return x[mask], y_new, scc[mask], sids[mask]


def generate_model_path(pretrained_model_dir, task, name):
    """Generate a model path based on the task and name."""

    if task == "three_class":
        return Path(pretrained_model_dir) / name
    else:
        return Path(pretrained_model_dir) / task / name
