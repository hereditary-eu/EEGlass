import os
from openai import OpenAI
from backend.models.chatbot import ChatRequest
from dotenv import load_dotenv

load_dotenv()

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


    # chatbot
    if os.getenv("SERVER") == "true":
        MODEL = os.getenv("OPENAI_MODEL", "meta-llama/Llama-3.2-3B-Instruct")
        client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv(
                "OPENAI_BASE_URL", "https://hereditary.cgv.tugraz.at/lm/api/v1"
            ),
        )
    else:
        MODEL = "gpt-4o-mini"
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
