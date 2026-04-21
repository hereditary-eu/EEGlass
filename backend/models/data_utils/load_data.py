import os
import mne
import pandas as pd

# Functions to load data for the ds004504 Dataset


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


def gen_participant_id_long(participant_id_int):
    """
    Generates the long participant ID format used in the EEG data from the integer participant ID.
    For example, if participant_id_int is 1, it will return 'sub-001'.
    """
    return f"sub-{get_participant_id(participant_id_int)}"


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

    eeg_data = mne.io.read_raw_eeglab(data_path, preload=True)
    df_eeg = eeg_data.to_data_frame()
    df_eeg = df_eeg.astype("float32")

    # print(f"memoery usage of df_eeg for participant {participant_id}: {df_eeg.memory_usage().sum() / 1024**2:.2f} MB")

    df_eeg["participant_id"] = participant_id_long

    return df_eeg


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
