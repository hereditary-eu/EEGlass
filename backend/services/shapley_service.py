import json
import re
from types import MethodType
from typing import Dict, Tuple

import numpy as np
import pandas as pd
import shap
import xgboost

from backend.config import CONFIG
from backend.utils.logger import get_logger

logger = get_logger(__name__)


class ShapleyService:
    @classmethod
    def get_shap_model(cls):
        if CONFIG.SHAP_MODEL == "xgboost":
            return xgboost.XGBRFRegressor(
                n_estimators=CONFIG.SHAP_MODEL_PARAMETERS["xgboost"]["n_estimators"],
                learning_rate=CONFIG.SHAP_MODEL_PARAMETERS["xgboost"]["learning_rate"],
                max_depth=CONFIG.SHAP_MODEL_PARAMETERS["xgboost"]["max_depth"],
                random_state=CONFIG.SHAP_MODEL_PARAMETERS["xgboost"]["random_state"],
            )
        raise ValueError(f"Model {CONFIG.SHAP_MODEL} not supported")

    @classmethod
    def normalize_data(cls, data: pd.DataFrame) -> pd.DataFrame:
        numeric_data = data.select_dtypes(include=["number"])
        # z-score normalization
        normalized_data = (numeric_data - numeric_data.mean()) / numeric_data.std()
        normalized_data = normalized_data.fillna(0)

        # Preserve non-numeric columns
        for col in data.select_dtypes(exclude=["number"]).columns:
            normalized_data[col] = data[col]

        return normalized_data

    @classmethod
    def _sanitize_column_names(cls, data: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, str]]:
        """
        Replace JSON-unsafe characters in column names to keep downstream libraries happy.
        Returns a renamed dataframe and a mapping from original -> sanitized columns.
        """
        name_map: Dict[str, str] = {}
        used: set[str] = set()

        def sanitize(name: str) -> str:
            cleaned = re.sub(r"[^0-9a-zA-Z_]", "_", name)
            cleaned = re.sub(r"_+", "_", cleaned).strip("_")
            return cleaned or "feature"

        for original in data.columns:
            base = sanitize(original)
            candidate = base
            idx = 1
            while candidate in used:
                candidate = f"{base}_{idx}"
                idx += 1
            name_map[original] = candidate
            used.add(candidate)

        return data.rename(columns=name_map), name_map

    @classmethod
    def _sanitize_xgb_booster(cls, model: xgboost.XGBRFRegressor) -> None:
        """
        XGBoost 3.x exposes some scalar booster attributes as single-value arrays (e.g. \"[-1e-6]\"),
        which SHAP <0.49 cannot parse. Strip the brackets so TreeExplainer sees plain floats.
        """
        if not hasattr(model, "get_booster"):
            return

        booster = model.get_booster()
        if booster is None:
            return

        updated = False
        config = json.loads(booster.save_config())
        learner_params = config.get("learner", {}).get("learner_model_param", {})
        for attr in ("base_score", "global_bias"):
            value = learner_params.get(attr)
            if isinstance(value, str):
                stripped = value.strip()
                if stripped.startswith("[") and stripped.endswith("]") and "," not in stripped:
                    learner_params[attr] = stripped[1:-1]
                    updated = True

        if updated:
            sanitized_config = json.dumps(config)

            def _sanitized_save_config(self, _cfg=sanitized_config):
                return _cfg

            booster.save_config = MethodType(_sanitized_save_config, booster)

    @classmethod
    def compute_shap_values(cls, model: xgboost.XGBRFRegressor, X: pd.DataFrame, y: pd.Series) -> pd.DataFrame:
        X_numeric = X.select_dtypes(include=["number"])
        model.fit(X_numeric, y)
        if isinstance(model, xgboost.XGBRFRegressor):
            cls._sanitize_xgb_booster(model)
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_numeric)

        column_shap_values = np.abs(shap_values).mean(axis=0)

        shap_importance = pd.DataFrame({"feature": X_numeric.columns, "SHAP Value": column_shap_values})

        shap_importance = shap_importance.sort_values(by="SHAP Value", ascending=False)

        return shap_importance

    @classmethod
    def compute_shapley_values_from_df(cls, data_df: pd.DataFrame, target_column: str) -> pd.DataFrame:
        """Compute Shapley values from a DataFrame."""
        model = cls.get_shap_model()
        normalized_data = cls.normalize_data(data_df)
        sanitized_data, column_map = cls._sanitize_column_names(normalized_data)

        if target_column not in column_map:
            raise ValueError(f"Target column {target_column} missing after sanitization")

        target_column_safe = column_map[target_column]

        X = sanitized_data.drop(columns=[target_column_safe])
        y = sanitized_data[target_column_safe]

        # check if X contains any numerical columns
        if X.select_dtypes(include=["number"]).empty:
            raise ValueError("No numerical columns found in the dataset")

        shap_values = cls.compute_shap_values(model, X, y)

        reverse_map = {sanitized: original for original, sanitized in column_map.items()}
        shap_values["feature"] = shap_values["feature"].map(lambda name: reverse_map.get(name, name))
        return shap_values
