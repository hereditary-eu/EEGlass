import logging
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class CONFIG:
    # APP
    TITLE = "EEGlass Backend"

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
    MODEL_PATIENT_AGGREGATION_STRATEGY = os.getenv("MODEL_PATIENT_AGGREGATION_STRATEGY", "disease_threshold")
    MODEL_PATIENT_ALZHEIMER_WINDOW_THRESHOLD = float(
        os.getenv(
            "MODEL_PATIENT_ALZHEIMER_WINDOW_THRESHOLD",
            os.getenv("MODEL_PATIENT_DISEASE_WINDOW_THRESHOLD", "0.3"),
        )
    )
    MODEL_PATIENT_FTD_WINDOW_THRESHOLD = float(
        os.getenv(
            "MODEL_PATIENT_FTD_WINDOW_THRESHOLD",
            os.getenv("MODEL_PATIENT_DISEASE_WINDOW_THRESHOLD", "0.3"),
        )
    )

    # LOGGING
    LOG_LEVEL = "DEBUG"
