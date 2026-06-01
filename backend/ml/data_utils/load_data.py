import os
import mne
import numpy as np
import pandas as pd

from backend.ml.model_vars import MODEL_CHANNELS, MODEL_INPUT_SOURCE, PARAMETERS_DEFAULT
from backend.utils.mne_logging import configure_mne_logging

configure_mne_logging()

# Functions to load data for the ds004504 Dataset

MICROVOLTS_SCALE = 1_000_000.0


def get_participant_id(participant_id_int):
    """
    Converts an integer participant ID to a zero-padded string format. For example, if participant_id_int is 1, it will return '001'.
    """
    return f"{participant_id_int:03d}"


def gen_filename(participant_id):
    """
    Generates the filename for the EEG data based on the participant ID. The filename format is 'sub-XXX/eeg/sub-XXX_task-eyesclosed_eeg.set', where XXX is the zero-padded participant ID.
    For example, if participant_id is '001', it will return 'sub-001/eeg/sub-001_task-eyesclosed_eeg.set'.
    """
    return os.path.join(f"sub-{participant_id}", "eeg", f"sub-{participant_id}_task-eyesclosed_eeg.set")


def gen_derivative_filename(participant_id):
    """
    Generates the derivative EEG path for a participant.
    """
    return os.path.join(
        "derivatives",
        f"sub-{participant_id}",
        "eeg",
        f"sub-{participant_id}_task-eyesclosed_eeg.set",
    )


def gen_participant_id_long(participant_id_int):
    """
    Generates the long participant ID format used in the EEG data from the integer participant ID.
    For example, if participant_id_int is 1, it will return 'sub-001'.
    """
    return f"sub-{get_participant_id(participant_id_int)}"


def gen_model_input_filename(participant_id):
    """
    Generates the canonical model-input EEG path. Model workflows use derivatives only.
    """
    if MODEL_INPUT_SOURCE != "derivatives":
        raise ValueError(f"Unsupported model input source: {MODEL_INPUT_SOURCE}")
    return gen_derivative_filename(participant_id)


def load_eeg_df(dir_data: str, participant_id_int: int, gen_path_func: callable):
    """
    Loads EEG data for a single participant and returns it as a DataFrame.
    """
    participant_id = get_participant_id(participant_id_int)
    participant_id_long = gen_participant_id_long(participant_id_int)

    filename = gen_path_func(participant_id)
    data_path = os.path.join(dir_data, filename)

    # print(f"Generated filename: {filename}")
    # print(f"Data directory: {dir_data}")
    # print(f"Full data path: {data_path}")

    eeg_data = load_preprocessed_raw_from_file(data_path)
    df_eeg = preprocessed_raw_to_dataframe(eeg_data)

    # print(f"memoery usage of df_eeg for participant {participant_id}: {df_eeg.memory_usage().sum() / 1024**2:.2f} MB")

    df_eeg["participant_id"] = participant_id_long

    return df_eeg


def load_model_windows_for_participant(
    dir_data: str,
    participant_id_int: int,
    sample_length: int | None = None,
    n_max: int | None = None,
):
    """
    Loads derivative EEG for one participant and returns xEEGNet-ready windows.

    Derivative files are the source of truth for model workflows. They are downsampled to the
    paper/model sampling rate in PARAMETERS_DEFAULT, then split into fixed 4-second windows.
    """
    participant_id = get_participant_id(participant_id_int)
    data_path = os.path.join(dir_data, gen_model_input_filename(participant_id))
    raw = load_preprocessed_raw_from_file(data_path)
    windows, sampling_frequency, prediction_ranges = preprocessed_raw_to_windows(raw, sample_length=sample_length)

    if n_max is not None:
        resolved_sample_length = int(sample_length or PARAMETERS_DEFAULT["sample_length"])
        max_windows = int(n_max) // resolved_sample_length
        if max_windows < 1:
            raise ValueError(
                f"n_max={n_max} is too small for one model window of {resolved_sample_length} samples."
            )
        windows = windows[:max_windows]
        prediction_ranges = prediction_ranges[:max_windows]

    return windows, sampling_frequency, prediction_ranges


def load_multiple_eeg_windows(
    dir_data: str,
    participant_ids: list[int],
    df_metadata: pd.DataFrame,
    sample_length: int | None = None,
    n_max: int | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Loads derivative EEG windows for multiple participants and matching class labels.
    """
    participant_dis_map = dict(zip(df_metadata["participant_id"], df_metadata["group_encoded"]))
    windows_by_subject = []
    labels_by_subject = []

    for participant_id_int in participant_ids:
        participant_id_long = gen_participant_id_long(participant_id_int)
        windows, _sampling_frequency, _prediction_ranges = load_model_windows_for_participant(
            dir_data,
            participant_id_int,
            sample_length=sample_length,
            n_max=n_max,
        )
        if participant_id_long not in participant_dis_map:
            raise ValueError(f"Missing diagnosis metadata for participant '{participant_id_long}'.")

        windows_by_subject.append(windows)
        labels_by_subject.append(
            np.full((windows.shape[0],), int(participant_dis_map[participant_id_long]), dtype=np.int64)
        )

    if not windows_by_subject:
        raise ValueError("At least one participant is required to load model windows.")

    x = np.concatenate(windows_by_subject, axis=0).astype("float32", copy=False)
    y = np.concatenate(labels_by_subject, axis=0).astype(np.int64, copy=False)
    print(f"Loaded derivative model windows: x shape {x.shape}, y shape {y.shape}")
    return x, y


def load_preprocessed_raw_from_file(data_path: str):
    raw = mne.io.read_raw_eeglab(data_path, preload=True, verbose="ERROR")
    return preprocess_raw_for_xeegnet(raw)


def preprocess_raw_for_xeegnet(raw):
    required_channels = list(MODEL_CHANNELS)
    missing_channels = [channel for channel in required_channels if channel not in raw.ch_names]
    if missing_channels:
        raise ValueError("Recording is missing required model channels: " + ", ".join(missing_channels))

    working_raw = raw.copy().pick(required_channels).load_data(verbose="ERROR")
    target_sampling_frequency = float(PARAMETERS_DEFAULT["srate"])
    current_sampling_frequency = float(working_raw.info["sfreq"])
    if current_sampling_frequency != target_sampling_frequency:
        working_raw.resample(target_sampling_frequency, verbose="ERROR")

    return working_raw


def preprocessed_raw_to_dataframe(raw) -> pd.DataFrame:
    channels = list(MODEL_CHANNELS)
    data = raw.get_data(picks=channels, verbose="ERROR") * MICROVOLTS_SCALE
    time = raw.times.astype("float32", copy=False)

    df_eeg = pd.DataFrame({"time": time})
    for channel_index, channel in enumerate(channels):
        df_eeg[channel] = data[channel_index].astype("float32", copy=False)

    return df_eeg.astype("float32")


def preprocessed_raw_to_windows(raw, sample_length: int | None = None):
    channels = list(MODEL_CHANNELS)
    resolved_sample_length = int(sample_length or PARAMETERS_DEFAULT["sample_length"])
    sampling_frequency = float(raw.info["sfreq"])

    data = raw.get_data(picks=channels, verbose="ERROR") * MICROVOLTS_SCALE
    total_samples = int(data.shape[1])
    if total_samples < resolved_sample_length:
        duration = total_samples / sampling_frequency
        window_size_seconds = resolved_sample_length / sampling_frequency
        raise ValueError(
            f"Recording is too short for inference. Need at least {window_size_seconds:.1f}s, found {duration:.3f}s."
        )

    window_count = total_samples // resolved_sample_length
    trimmed = data[:, : window_count * resolved_sample_length]
    windows = trimmed.reshape(len(channels), window_count, resolved_sample_length).transpose(1, 0, 2)

    prediction_ranges = [
        (
            float(window_index * resolved_sample_length / sampling_frequency),
            float((window_index + 1) * resolved_sample_length / sampling_frequency),
        )
        for window_index in range(window_count)
    ]

    return windows.astype("float32", copy=False), sampling_frequency, prediction_ranges


def load_multiple_eegfiles(dir_data, participant_ids, gen_path_func, df_metadata, n_max=None):
    """
    Load EEG data for multiple participants and combine into a single DataFrame. Add metadata information (class labels) to the combined DataFrame.

    Parameters:
    - dir_data (str): Path to the data directory.
    - participant_ids (list): List of participant IDs.
    - gen_path_func (callable): Function to generate file paths.
    - df_metadata (pd.DataFrame): Metadata DataFrame.
    - n_max (int, optional): Maximum number of rows to include per participant.

    Returns:
    - pd.DataFrame: Combined DataFrame with EEG data and metadata.

    """
    df_list = []
    for participant_id_int in participant_ids:
        df_eeg = load_eeg_df(dir_data, participant_id_int, gen_path_func)
        if n_max is not None:
            df_eeg = df_eeg.head(n_max)
        df_list.append(df_eeg)
    df_all = pd.concat(df_list, ignore_index=True)

    print(f"Total memory usage of combined df_eeg: {df_all.memory_usage().sum() / 1024**2:.2f} MB")

    participant_dis_map = dict(zip(df_metadata["participant_id"], df_metadata["group_encoded"]))
    df_all["diagnosis"] = df_all["participant_id"].map(participant_dis_map).astype("int8")
    return df_all


def load_metadata(dir_data: str):
    """
    Loads the metadata from the participants.tsv file and processes it to add group labels and encoded group labels. The function reads the TSV file into a DataFrame, maps the group codes to long group names and encodes the group labels as integers.
    - dir_data: Path to the data directory containing the participants.tsv file.
    """
    metadata_path = os.path.join(dir_data, "participants.tsv")
    df_metadata = pd.read_csv(metadata_path, sep="\t")

    disease_mapping = {"A": "Alzheimer Disease Group", "F": "Frontotemporal Dementia Group", "C": "Healthy Group"}

    disease_encoding = {
        "A": 1,
        "F": 2,
        "C": 0,
    }

    df_metadata["group_long"] = df_metadata["Group"].map(disease_mapping)
    df_metadata["group_encoded"] = df_metadata["Group"].map(disease_encoding)
    df_metadata["participant_id_int"] = df_metadata["participant_id"].apply(lambda x: int(x.split("-")[1]))

    return df_metadata
