import numpy as np
import torch
import selfeeg
from pathlib import Path
import sys

dir_base = Path(__file__).parent.parent.parent.parent.resolve()  # backend/
sys.path.append(str(dir_base))  # add backend/ to sys.path so selfeeg can be imported

from backend.ml.xeegnet_scc_utils.xeegnet_with_conn import xEEGNetSCC
from backend.ml.data_utils.load_data import load_metadata
from backend.ml.shallownet_utils_dev import get_performances
from backend.ml.scc_cache import SCCStore, SCCParams
from backend.ml.xeegnet_scc_utils.model_evaluations import generate_model_name, get_dataloaders_xysubjectids
from main import load_participant_splits

from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    precision_score,
    recall_score,
)

__all__ = [
    "build_model_for_version",
    "_predict_from_loader",
    "_compute_metrics",
    "_prepare",
    "_evaluate_splits",
    "_predict_from_loader_with_ids",
    "aggregate_subject_predictions",
]


def build_model_for_version(
    model_kind: str,
    nb_classes: int,
    Chans: int,
    sample_length: int,
    srate: int,
    reducer_mode_scc: str = "mean",
    seed: int = 42,
):
    """
    reducer mode:
        "mean"   -> average SCC across pairs for each band (default)
        "node"   -> weighted sum of 19 channels (7x19 weights)
        "edge"   -> weight for each of the 171 pairs (7x171 weights)
    """

    np.random.seed(seed)
    torch.manual_seed(seed)

    model_kind = model_kind.casefold()
    if model_kind == "xeegnet_scc":
        base_model = selfeeg.models.xEEGNet(
            nb_classes=nb_classes, Chans=Chans, Samples=sample_length, Fs=srate, global_pooling=True, return_logits=True
        )
        return xEEGNetSCC(base_model=base_model, reducer_mode_scc=reducer_mode_scc)
    if model_kind == "xeegnet":
        return selfeeg.models.xEEGNet(
            nb_classes=nb_classes,
            Chans=Chans,
            Samples=sample_length,
            Fs=srate,
            global_pooling=True,
        )
    # if model_kind == "shallownet":
    #     return ShallowNet(nb_classes=nb_classes, Chans=Chans, Samples=sample_length, seed=seed)
    # raise ValueError(f"Unsupported model_kind: {model_kind}")


def _predict_from_loader(model, loader, device):
    model.eval()
    y_true_all = []
    y_pred_all = []

    with torch.no_grad():
        for inputs, targets in loader:
            targets_np = targets.detach().cpu().numpy()
            if isinstance(inputs, (list, tuple)):
                x_batch = inputs[0].to(device)
                scc_batch = inputs[1].to(device)
                outputs = model([x_batch, scc_batch])
            else:
                outputs = model(inputs.to(device))

            if outputs.shape[1] == 1:  # single-logit (binary) head
                predictions = (outputs.squeeze(1) > 0).long()  # logit > 0  ==  sigmoid > 0.5
            else:  # multi-logit head
                predictions = torch.argmax(outputs, dim=1)

            y_true_all.extend(targets_np.tolist())
            y_pred_all.extend(predictions.tolist())

    return np.asarray(y_true_all), np.asarray(y_pred_all)


def _compute_metrics(y_true, y_pred):
    return {
        "accuracy": accuracy_score(y_true, y_pred),
        "balanced_accuracy": balanced_accuracy_score(y_true, y_pred),
        "f1_macro": f1_score(y_true, y_pred, average="macro", zero_division=0),
        "f1_weighted": f1_score(y_true, y_pred, average="weighted", zero_division=0),
        "precision_macro": precision_score(y_true, y_pred, average="macro", zero_division=0),
        "precision_weighted": precision_score(y_true, y_pred, average="weighted", zero_division=0),
        "recall_macro": recall_score(y_true, y_pred, average="macro", zero_division=0),
        "recall_weighted": recall_score(y_true, y_pred, average="weighted", zero_division=0),
    }


def _prepare(
    model_version,
    model_kind,
    reducer_mode_scc,
    *,
    dir_data,
    dir_data_outer,
    parameters,
    nb_classes,
    Chans,
    sample_length,
    srate,
    device,
    n_max,
    store,
    scc_params,
    load_model_windows_for_participant,
    data_x_y_id,
    data_x_y_scc_id,
    model_seed,
    shuffle_train=True,
    return_subject_ids=False,
):
    """Shared setup: split lookup, metadata, model, loaders, canonical name.

    Both entry points go through this so they can never disagree on how the
    model, loaders, or checkpoint name are built.
    """
    split_index = model_version - 200
    split_path = Path(dir_base) / "backend" / "ml" / "data_splits.json"
    participants_split = load_participant_splits(split_path=split_path)[str(split_index)]

    df_metadata = load_metadata(dir_data=dir_data)
    df_metadata["datasplit"] = "test"
    df_metadata.loc[df_metadata["participant_id_int"].isin(participants_split["train"]), "datasplit"] = "train"
    df_metadata.loc[df_metadata["participant_id_int"].isin(participants_split["val"]), "datasplit"] = "val"

    model = build_model_for_version(
        model_kind, nb_classes, Chans, sample_length, srate, reducer_mode_scc, seed=model_seed
    ).to(device)

    if model_kind.casefold() == "xeegnet_scc":
        if load_model_windows_for_participant is None:
            load_model_windows_for_participant = globals().get("load_model_windows_for_participant")
        if load_model_windows_for_participant is None:
            raise ValueError("load_model_windows_for_participant is required for xeegnet_scc.")
        if store is None:
            store = SCCStore(root=Path(dir_data_outer) / "scc_cache")
        if scc_params is None:
            scc_params = SCCParams.default(sfreq=srate, sample_length=sample_length)

        trainloader, valloader, testloader, xy = get_dataloaders_xysubjectids(
            dir_data=dir_data,
            participant_ids_train=participants_split["train"],
            participant_ids_val=participants_split["val"],
            participant_ids_test=participants_split["test"],
            df_metadata=df_metadata,
            parameters=parameters,
            n_max=n_max,
            use_cached_scc=True,
            store=store,
            scc_params=scc_params,
            dataset_id="ds004504",
            n_channels=Chans,
            source="derivatives",
            load_model_windows_for_participant=load_model_windows_for_participant,
            data_x_y_id=data_x_y_id,
            data_x_y_scc_id=data_x_y_scc_id,
            shuffle_train=shuffle_train,
        )
    else:
        trainloader, valloader, testloader, xy = get_dataloaders_xysubjectids(
            dir_data=dir_data,
            participant_ids_train=participants_split["train"],
            participant_ids_val=participants_split["val"],
            participant_ids_test=participants_split["test"],
            df_metadata=df_metadata,
            parameters=parameters,
            n_max=n_max,
            use_cached_scc=False,
            data_x_y_id=data_x_y_id,
            data_x_y_scc_id=data_x_y_scc_id,
            shuffle_train=shuffle_train,
        )

    # if model_kind.casefold() == "xeegnet_scc":
    #     _, _, subject_ids_train, _, _, _, subject_ids_val, _, _, _, subject_ids_test, _= xy
    # elif model_kind.casefold() == "xeegnet":
    #     _, _, subject_ids_train, _, _, subject_ids_val, _, _, subject_ids_test = xy
    # subject_ids = {"train": subject_ids_train, "val": subject_ids_val, "test": subject_ids_test}

    model_name = generate_model_name(model_kind, model_version, n_max, reducer_mode_scc)
    loaders = {"train": trainloader, "val": valloader, "test": testloader}
    if return_subject_ids:
        if model_kind.casefold() == "xeegnet_scc":
            _, _, subject_ids_train, _, _, subject_ids_val, _, _, _, _, subject_ids_test, _ = xy
        elif model_kind.casefold() == "xeegnet":
            _, _, subject_ids_train, _, _, subject_ids_val, _, _, subject_ids_test = xy
        subject_ids = {"train": subject_ids_train, "val": subject_ids_val, "test": subject_ids_test}
        return model, loaders, model_name, subject_ids
    else:
        return model, loaders, model_name


def _evaluate_splits(
    model, loaders, eval_datasplits, result_base, *, device, nb_classes, plot_confusion=False, subject_ids=None
):
    """Evaluate on each split. Emits a 'window' row per split, plus a
    'subject_majority' row when subject_ids aggregation is requested.
    Ids ride with each sample (dataset returns them), so this is correct
    even for the shuffled train loader."""
    rows = []
    for datasplit in eval_datasplits:
        if subject_ids is not None:
            y_true, y_pred, sids = _predict_from_loader_with_ids(
                model,
                loaders[datasplit],
                device,
                subject_ids[datasplit],  # 3 args — ids come from batches
            )
        else:
            y_true, y_pred = _predict_from_loader(model, loaders[datasplit], device)
            sids = None

        rows.append(
            {
                **result_base,
                "datasplit": datasplit,
                "aggregation": "window",
                "n_samples": len(y_true),
                **_compute_metrics(y_true, y_pred),
            }
        )

        if sids is not None:
            subj_true, subj_pred, _ = aggregate_subject_predictions(y_true, y_pred, sids, nb_classes)
            rows.append(
                {
                    **result_base,
                    "datasplit": datasplit,
                    "aggregation": "subject_majority",
                    "n_samples": len(subj_true),
                    **_compute_metrics(subj_true, subj_pred),
                }
            )

    if plot_confusion:
        get_performances(
            loader2eval=loaders["test"],
            Model=model,
            device=device,
            nb_classes=nb_classes,
            return_scores=False,
            verbose=False,
            plot_confusion=True,
            class_labels=[f"Class {i}" for i in range(nb_classes)],
        )
    return rows


def _predict_from_loader_with_ids(model, loader, device, subject_ids):
    """subject_ids: per-split id array aligned to the loader's order (shuffle=False)."""
    y_true, y_pred = _predict_from_loader(model, loader, device)  # 2-tuple loaders
    sids = np.asarray(subject_ids)
    if len(sids) != len(y_true):
        raise ValueError(f"subject_ids ({len(sids)}) != predictions ({len(y_true)}) — split misaligned.")
    return y_true, y_pred, sids


def aggregate_subject_predictions(y_true, y_pred, subject_ids, nb_classes):
    """Collapse window predictions to one prediction per subject by majority vote.
    Returns (subj_true, subj_pred, subject_order) as arrays aligned by subject."""
    subject_order = np.unique(subject_ids)
    subj_true, subj_pred = [], []
    for sid in subject_order:
        m = subject_ids == sid
        true_vals = y_true[m]
        if not np.all(true_vals == true_vals[0]):  # alignment guard
            raise ValueError(f"Subject {sid} has mixed true labels {np.unique(true_vals)} — sids/y misaligned.")
        subj_true.append(int(true_vals[0]))
        # majority vote over window predictions; bincount ties -> lowest class (deterministic)
        counts = np.bincount(y_pred[m].astype(int), minlength=nb_classes)
        subj_pred.append(int(counts.argmax()))
    return np.asarray(subj_true), np.asarray(subj_pred), subject_order
