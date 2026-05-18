import csv
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any
import argparse

from backend.ml.model_registry import DEFAULT_MODEL_NAME, get_model_spec

DEFAULT_DATASET_ID = "ds004504"
DEFAULT_SOURCE = "derivatives"


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
    from backend.ml.data_utils.load_data import load_metadata
    from backend.ml.data_utils.prepare_data import split_participants_min_per_class
    from backend.ml.model_vars import PRETRAINED_MODEL_DIR
    from backend.ml.train import train_save_model

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
    from backend.ml.model_vars import PRETRAINED_MODEL_DIR
    from backend.ml.train import load_model_weights

    modelname = "xeegnet_model_v1.pt"
    model_path = PRETRAINED_MODEL_DIR / modelname
    model = load_model_weights(model_path)
    return model


def export_patient_embeddings(
    *,
    dataset_id: str = DEFAULT_DATASET_ID,
    model_name: str = DEFAULT_MODEL_NAME,
    source: str = DEFAULT_SOURCE,
    output_path: str | Path | None = None,
) -> Path:
    checkpoint_signature = get_checkpoint_signature(model_name)
    checkpoint_key = get_checkpoint_key(checkpoint_signature)
    cache_dir = (
        Path(os.getenv("MODEL_OUTPUT_STORAGE_DIR", "data/model_outputs")) / dataset_id / model_name / checkpoint_key
    )
    resolved_output_path = (
        Path(output_path) if output_path else cache_dir / f"patient_penultimate_embeddings.{source}.csv"
    )

    rows: list[dict[str, Any]] = []
    embedding_dimension = 0
    for artifact_path in sorted((cache_dir / "subjects").glob(f"*.{source}.predictions.json")):
        artifact = read_json(artifact_path)
        subject_id = artifact["subject_id"]
        embedding_values = [float(value) for value in artifact["embedding"]["values"]]
        if embedding_dimension == 0:
            embedding_dimension = len(embedding_values)

        summary = artifact["summary"]
        rows.append(
            {
                "dataset_id": dataset_id,
                "subject_id": subject_id,
                "source": source,
                "model_name": model_name,
                "checkpoint_key": checkpoint_key,
                "true_label": summary.get("true_label"),
                "predicted_label": summary.get("predicted_label"),
                "mean_confidence": summary.get("mean_confidence"),
                "total_windows": summary.get("total_windows"),
                **{f"embedding_{index}": value for index, value in enumerate(embedding_values)},
            }
        )

    if not rows:
        raise RuntimeError("No valid cached patient embeddings found. Run the predict-all job first.")

    fieldnames = [
        "dataset_id",
        "subject_id",
        "source",
        "model_name",
        "checkpoint_key",
        "true_label",
        "predicted_label",
        "mean_confidence",
        "total_windows",
        *[f"embedding_{index}" for index in range(embedding_dimension)],
    ]

    resolved_output_path.parent.mkdir(parents=True, exist_ok=True)
    with resolved_output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} patient embeddings to {resolved_output_path}")
    return resolved_output_path


def get_checkpoint_signature(model_name: str) -> str:
    checkpoint_path = get_model_spec(model_name).checkpoint_path.resolve()
    if not checkpoint_path.is_file():
        raise FileNotFoundError(f"Model checkpoint not found: {checkpoint_path}")
    stat = checkpoint_path.stat()
    return f"{checkpoint_path}:{stat.st_mtime_ns}:{stat.st_size}"


def get_checkpoint_key(checkpoint_signature: str) -> str:
    digest = hashlib.sha256(checkpoint_signature.encode("utf-8")).hexdigest()[:16]
    return f"checkpoint-{digest}"


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser()
    parser.add_argument("action")
    args = parser.parse_args()

    if args.action == "train":
        train()
    elif args.action == "load-model":
        load_model()
    elif args.action == "export-patient-embeddings":
        export_patient_embeddings()
    else:
        parser.print_help()
