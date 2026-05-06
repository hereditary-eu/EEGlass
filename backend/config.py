import logging
import os
from openai import OpenAI
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

    # chatbot — only construct client when OPENAI_API_KEY is set (avoids import-time crash)
    _api_key = os.getenv("OPENAI_API_KEY")
    if os.getenv("SERVER") == "true":
        MODEL = os.getenv("OPENAI_MODEL", "meta-llama/Llama-3.2-3B-Instruct")
        if _api_key:
            client = OpenAI(
                api_key=_api_key,
                base_url=os.getenv("OPENAI_BASE_URL", "https://hereditary.cgv.tugraz.at/lm/api/v1"),
            )
        else:
            client = None
            logger.warning("OPENAI_API_KEY is not set; chatbot routes will return 503 until it is configured.")
    else:
        MODEL = "gpt-4o-mini"
        if _api_key:
            client = OpenAI(api_key=_api_key)
        else:
            client = None
            logger.warning("OPENAI_API_KEY is not set; chatbot routes will return 503 until it is configured.")
