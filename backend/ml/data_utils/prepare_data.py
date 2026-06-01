import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader, TensorDataset
from tqdm import tqdm


def split_data(df, test_split=0.2, val_split=0.2):
    n_samples = df.shape[0]
    n_test_samples = int(n_samples * test_split)

    df_test = df.iloc[-n_test_samples:]
    df_val = df.iloc[-n_test_samples - int(n_samples * val_split) : -n_test_samples]
    df_train = df.iloc[: -n_test_samples - int(n_samples * val_split)]

    return df_train, df_val, df_test


def split_train_test_val(df, test_split=0.2, val_split=0.2):
    """
    Gets dataframe, groups it by participant_id, and splits it into train, test and validation sets.
     - test_split: percentage of samples to be used for testing
     - val_split: percentage of samples to be used for validation
     - the remaining samples will be used for training
     - the split is done at the participant level, meaning that all samples from a participant will be in the same set (train, test or validation)
    """
    df_train = pd.DataFrame()
    df_val = pd.DataFrame()
    df_test = pd.DataFrame()

    df_grouped = df.groupby("participant_id")
    for participant_id, group in df_grouped:
        print(f"participantpantpaparticipantpant{participant_id}, Number of samples: {len(group)}")
        df_train_participant, df_val_participant, df_test_participant = split_data(group, test_split, val_split)
        df_train = pd.concat([df_train, df_train_participant])
        df_val = pd.concat([df_val, df_val_participant])
        df_test = pd.concat([df_test, df_test_participant])

    return df_train, df_val, df_test


def split_participants_min_per_class(
    df_metadata, label_col="group_encoded", id_col=None, ratios=(0.7, 0.15, 0.15), random_state=42
):
    """
    Splits participants into train, validation and test sets while ensuring that each class is represented in each set. The split is done at the participant level, meaning that all samples from a participant will be in the same set (train, test or validation).
        - label_col: name of the column in df_metadata that contains the class labels
        - id_col: name of the column in df_metadata
          that contains the participant IDs
        - ratios: tuple of three floats representing the proportions for train, validation and test sets
        - random_state: seed for the random number generator
    """

    rng = np.random.default_rng(random_state)

    if id_col is None:
        ids = df_metadata.index
    else:
        ids = df_metadata[id_col]

    # df_metadata = df_metadata.copy()
    df_metadata["__id__"] = ids

    train, val, test = [], [], []

    ratios = np.array(ratios)
    if not np.isclose(ratios.sum(), 1.0):
        print(f"Ratios do not sum to 1. Normalizing ratios {ratios} to {ratios / ratios.sum()}")
        ratios = ratios / ratios.sum()

    for label, group in df_metadata.groupby(label_col):
        participants = group["__id__"].tolist()
        rng.shuffle(participants)

        n = len(participants)

        # desired counts
        n_train = max(1, int(round(n * ratios[0])))
        if ratios[1] > 0:
            n_val = max(1, int(round(n * ratios[1])))
        else:
            print("Validation split is set to 0")
            n_val = 0
        if ratios[2] > 0:
            n_test = max(1, int(round(n * ratios[2])))
        else:
            print("Test split is set to 0")
            n_test = 0

        # fix overflow
        splits = np.array([n_train, n_val, n_test])
        while sum(splits) > n:
            print(f"Overflow in splits for label {label} with n={n}. Current splits: {splits}. Reducing largest split.")
            idx = np.argmax(splits)  # reduce largest
            splits[idx] -= 1
            # print(f"New splits: {splits}")
            # print(splits[idx])

        while sum(splits) < n:
            print(
                f"Underflow in splits for label {label} with n={n}. Current splits: {splits}. Increasing largest split."
            )
            idx = np.argmax(splits)  # increase largest
            splits[idx] += 1

        n_train, n_val, n_test = splits

        train += participants[:n_train]
        val += participants[n_train : n_train + n_val]
        test += participants[n_train + n_val : n_train + n_val + n_test]

    df_metadata.loc[df_metadata["__id__"].isin(train), "datasplit"] = "train"
    df_metadata.loc[df_metadata["__id__"].isin(val), "datasplit"] = "val"
    df_metadata.loc[df_metadata["__id__"].isin(test), "datasplit"] = "test"

    df_metadata.drop(columns=["__id__"], inplace=True)

    print(
        f"# Patients in train: {len(train)}, val: {len(val)}, test: {len(test)}"
        + f" with {df_metadata[label_col].nunique()} classes and {len(df_metadata)} total samples."
    )

    return train, val, test


def reshape_eeg(df_eeg, Chans, sample_length):
    n_samples = df_eeg.shape[0]
    n_windows = n_samples // sample_length
    eeg_array = df_eeg.iloc[: n_windows * sample_length, 1 : Chans + 1].values
    eeg_array = eeg_array.reshape(n_windows, sample_length, Chans)
    eeg_array = np.transpose(eeg_array, (0, 2, 1))  # Reshape to (n_windows, Chans, sample_length)
    eeg_array = torch.tensor(eeg_array, dtype=torch.float32)
    # eeg_array = torch.tensor(eeg_array, dtype=torch.long)
    # eeg_array = eeg_array.type(torch.LongTensor)
    return eeg_array


def reshape_y(y, sample_length):
    n_samples = len(y)
    n_windows = n_samples // sample_length
    y_array = y.iloc[: n_windows * sample_length].values
    y_array = y_array.reshape(n_windows, sample_length)
    y_array = y_array[:, 0]  # Take the first label in each window (assuming all labels in the window are the same)
    y_array = torch.tensor(y_array, dtype=torch.long)
    return y_array


def reshape_eeg_multipl(df_eeg, y_column, x_columns, Chans, sample_length):
    """
    Reshapes eeg data and labels for multiple participants. The data is reshaped to the format (n_samples, Chans, sample_length) which is the format expected by xEEGNet and shallownetk.
    - df_eeg: DataFrame containing the EEG data and participant IDs
    - y_column: Name of the column in df_eeg that contains the labels
    - x_columns: List of column names in df_eeg that contain the EEG data (excluding participant_id and label columns)
    - Chans: Number of EEG channels
    - sample_length: Length of each sample (number of time points)
    """
    participant_ids = df_eeg["participant_id"].unique()
    eeg_arrays = []
    eeg_y = []
    for participant_id in tqdm(participant_ids):
        df_participant = df_eeg[df_eeg["participant_id"] == participant_id]
        eeg_array_participant = reshape_eeg(df_participant[x_columns], Chans, sample_length)
        y_participant = reshape_y(df_participant[y_column], sample_length)

        eeg_arrays.append(eeg_array_participant)
        eeg_y.append(y_participant)
    eeg_array = torch.cat(eeg_arrays, dim=0)
    eeg_y = torch.cat(eeg_y, dim=0)
    return eeg_array, eeg_y


def get_data_loader(df, Chans, sample_length, batchsize, workers, x_columns, y_column="diagnosis"):
    x, y = reshape_eeg_multipl(df, x_columns=x_columns, y_column=y_column, Chans=Chans, sample_length=sample_length)
    dataloader = DataLoader(list(zip(x, y)), batch_size=batchsize, shuffle=True, num_workers=workers)
    return dataloader


def get_window_data_loader(x, y, batchsize, workers, shuffle=True):
    x_tensor = torch.as_tensor(x, dtype=torch.float32)
    y_tensor = torch.as_tensor(y, dtype=torch.long)
    return DataLoader(TensorDataset(x_tensor, y_tensor), batch_size=batchsize, shuffle=shuffle, num_workers=workers)


def get_data_loaders(
    df_eeg, df_metadata, x_columns, Chans, sample_length, batchsize, workers, ratios=(0.7, 0.15, 0.15)
):
    """
    Gets data loaders for training, validation and testing, which have the correct format for xEEGNet and shallownetk.
    - df_eeg: DataFrame containing the EEG data and participant IDs
    - df_metadata: DataFrame containing the metadata information (class labels) for each participant
    - x_columns: List of column names in df_eeg that contain the EEG data (excluding participant_id and label columns)
    - Chans: Number of EEG channels
    - sample_length: Length of each sample (number of time points)
    - batchsize: Batch size for the data loaders
    - workers: Number of workers for the data loaders
    - ratios: Tuple containing the ratios for splitting the data into train, validation and test sets
    """
    df_metadata_filtered = df_metadata.set_index("participant_id").loc[df_eeg["participant_id"].unique(), :]

    splits = split_participants_min_per_class(df_metadata_filtered, ratios=ratios)
    train_ids, val_ids, test_ids = splits

    df_train = df_eeg[df_eeg["participant_id"].isin(train_ids)]
    df_val = df_eeg[df_eeg["participant_id"].isin(val_ids)]
    df_test = df_eeg[df_eeg["participant_id"].isin(test_ids)]

    trainloader = get_data_loader(df_train, Chans, sample_length, batchsize, workers, x_columns)
    valloader = get_data_loader(df_val, Chans, sample_length, batchsize, workers, x_columns)
    testloader = get_data_loader(df_test, Chans, sample_length, batchsize, workers, x_columns)

    return trainloader, valloader, testloader
