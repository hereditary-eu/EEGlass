import logging
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class CONFIG:
    # APP
    TITLE = "All-in-on-EEG Backend"

    # CORS
    ORIGINS = [
        "http://localhost",
        "http://localhost:3000",
    ]

    # DATA
    DATASET_STORAGE_DIR = os.getenv("DATASET_STORAGE_DIR", "data/datasets")
    MODEL_OUTPUT_STORAGE_DIR = os.getenv("MODEL_OUTPUT_STORAGE_DIR", "data/model_outputs")
    MODEL_PREDICTION_WORKERS = int(os.getenv("MODEL_PREDICTION_WORKERS", "1"))
    MODEL_OUTPUT_TMP_MAX_AGE_SECONDS = int(os.getenv("MODEL_OUTPUT_TMP_MAX_AGE_SECONDS", "3600"))

    # MODEL AGGREGATION
    # Supported: "majority_vote". Kept configurable so patient-level rules can
    # move to disease-threshold or confidence-weighted aggregation later.
    MODEL_PATIENT_AGGREGATION_STRATEGY = os.getenv("MODEL_PATIENT_AGGREGATION_STRATEGY", "majority_vote")
    MODEL_PATIENT_DISEASE_WINDOW_THRESHOLD = float(os.getenv("MODEL_PATIENT_DISEASE_WINDOW_THRESHOLD", "0.3"))

    # LOGGING
    LOG_LEVEL = "DEBUG"

