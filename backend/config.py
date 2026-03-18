import os


class CONFIG:
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
