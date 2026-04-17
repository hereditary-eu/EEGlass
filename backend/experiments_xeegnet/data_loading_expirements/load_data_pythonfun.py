import os
import mne

# curr_file_path = os.path.abspath(__file__)
# print("curr_file_path:", curr_file_path)
# curr_directory = os.path.dirname(os.path.dirname(curr_file_path))
# print("curr_directory:", curr_directory)
# dir_base = curr_directory


def load_eeg_data(
    participant: int,
    channel_name: str,
    dir_data: str,
    data_type: str = "derivatives",
    n_points: int = None,
):
    """ "
    Function to load single channel of single patietnt's EEG data. Used for testing and visualization purposes.
    """
    print("load_eeg_data called with:", participant, channel_name, data_type, n_points)
    if data_type == "derivatives":
        data_path = os.path.join(
            dir_data, "derivatives", f"sub-{participant:03d}", "eeg", f"sub-{participant:03d}_task-eyesclosed_eeg.set"
        )
        print("Loading data from:", data_path)
        eeg_set = mne.io.read_raw_eeglab(data_path, preload=True)
        if channel_name in eeg_set.ch_names:
            channel_data = eeg_set[channel_name][0][0]  # Get data for the specified channel
            time_vector = eeg_set.times  # Get the time vector
            # return EEGDataResponse(channel_data[:n_points], time_vector[:n_points])
            return channel_data[:n_points], time_vector[:n_points]
        else:
            raise ValueError(f"Channel {channel_name} not found in EEG data. available channels: {eeg_set.ch_names}")
