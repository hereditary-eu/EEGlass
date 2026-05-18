from __future__ import annotations

import logging
import os

DEFAULT_MNE_LOG_LEVEL = "ERROR"


def configure_mne_logging() -> None:
    log_level = os.getenv("MNE_LOG_LEVEL", DEFAULT_MNE_LOG_LEVEL).upper()
    logging.getLogger("mne").setLevel(log_level)

    try:
        import mne
    except ImportError:
        return

    mne.set_log_level(log_level)
