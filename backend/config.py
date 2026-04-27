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

    # DATABASE
    SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL", "sqlite:///./backend/app.db")
    DATASET_STORAGE_DIR = os.getenv("DATASET_STORAGE_DIR", "data/datasets")

    # SHAP
    SHAP_MODEL = "xgboost"
    SHAP_MODEL_PARAMETERS = {
        "xgboost": {"n_estimators": 100, "learning_rate": 0.1, "max_depth": 6, "random_state": 42},
    }

    # LOGGING
    LOG_LEVEL = "DEBUG"


    # chatbot — only construct client when OPENAI_API_KEY is set (avoids import-time crash)
    _api_key = os.getenv("OPENAI_API_KEY")
    if os.getenv("SERVER") == "true":
        MODEL = os.getenv("OPENAI_MODEL", "meta-llama/Llama-3.2-3B-Instruct")
        if _api_key:
            client = OpenAI(
                api_key=_api_key,
                base_url=os.getenv(
                    "OPENAI_BASE_URL", "https://hereditary.cgv.tugraz.at/lm/api/v1"
                ),
            )
        else:
            client = None
            logger.warning(
                "OPENAI_API_KEY is not set; chatbot routes will return 503 until it is configured."
            )
    else:
        MODEL = "gpt-4o-mini"
        if _api_key:
            client = OpenAI(api_key=_api_key)
        else:
            client = None
            logger.warning(
                "OPENAI_API_KEY is not set; chatbot routes will return 503 until it is configured."
            )

