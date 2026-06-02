from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # APP
    TITLE: str = "EEGlass Backend"

    # CORS
    ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost", "http://localhost:3000"])

    # DATA
    DATASET_STORAGE_DIR: str = "data/datasets"
    MODEL_OUTPUT_STORAGE_DIR: str = "data/model_outputs"
    MODEL_PREDICTION_WORKERS: int = 1
    MODEL_OUTPUT_TMP_MAX_AGE_SECONDS: int = 3600

    # MODEL FEATURE IMPORTANCE
    MODEL_FEATURE_IMPORTANCE_DEFAULT_METHOD: str = "shap"
    MODEL_FEATURE_IMPORTANCE_BACKEND_MODEL: str = "xgboost"
    MODEL_FEATURE_IMPORTANCE_MIN_ROWS: int = 3
    MODEL_FEATURE_IMPORTANCE_MIN_CLASSES: int = 2
    MODEL_FEATURE_IMPORTANCE_XGBOOST_N_ESTIMATORS: int = 80
    MODEL_FEATURE_IMPORTANCE_XGBOOST_MAX_DEPTH: int = 3
    MODEL_FEATURE_IMPORTANCE_XGBOOST_LEARNING_RATE: float = 0.08
    MODEL_FEATURE_IMPORTANCE_XGBOOST_RANDOM_STATE: int = 42

    # MODEL AGGREGATION
    MODEL_PATIENT_AGGREGATION_STRATEGY: str = "disease_threshold"
    MODEL_PATIENT_DISEASE_WINDOW_THRESHOLD: float = 0.3
    MODEL_PATIENT_ALZHEIMER_WINDOW_THRESHOLD: float | None = None
    MODEL_PATIENT_FTD_WINDOW_THRESHOLD: float | None = None

    # LOGGING
    LOG_LEVEL: str = "DEBUG"

    # API
    GZIP_MINIMUM_SIZE: int = 1000

    @field_validator("ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def apply_patient_threshold_fallbacks(self) -> "Settings":
        if self.MODEL_PATIENT_ALZHEIMER_WINDOW_THRESHOLD is None:
            self.MODEL_PATIENT_ALZHEIMER_WINDOW_THRESHOLD = self.MODEL_PATIENT_DISEASE_WINDOW_THRESHOLD
        if self.MODEL_PATIENT_FTD_WINDOW_THRESHOLD is None:
            self.MODEL_PATIENT_FTD_WINDOW_THRESHOLD = self.MODEL_PATIENT_DISEASE_WINDOW_THRESHOLD
        return self


CONFIG = Settings()
