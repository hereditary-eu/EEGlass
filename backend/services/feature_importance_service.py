from __future__ import annotations

import hashlib
from collections import OrderedDict
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from backend.config import CONFIG
from backend.ml.model_vars import DEFAULT_FEATURE_IMPORTANCE_BACKEND_MODEL, DEFAULT_FEATURE_IMPORTANCE_METHOD
from backend.pydantic_models.embeddings import ModelPatientEmbeddingsResponse, ModelWindowEmbeddingsResponse
from backend.pydantic_models.feature_importance import (
    FeatureImportanceMethod,
    FeatureImportanceStatus,
    FeatureImportanceTargetColumn,
    ModelFeatureImportanceItem,
    ModelFeatureImportanceResponse,
)
from backend.pydantic_models.timeseries import TimeseriesSource
from backend.services.model_errors import ModelDependencyUnavailableError, ModelServiceError, ModelValidationError
from backend.services.prediction_cache_service import PredictionCacheService


@dataclass(frozen=True)
class FeatureImportanceInput:
    features: np.ndarray
    labels: tuple[str, ...]
    feature_names: tuple[str, ...]
    target_column: FeatureImportanceTargetColumn


class FeatureImportanceCalculator(Protocol):
    method: FeatureImportanceMethod
    backend_model: str
    unit_label: str

    def calculate(self, data: FeatureImportanceInput) -> list[ModelFeatureImportanceItem]:
        ...


class ShapXgboostFeatureImportanceCalculator:
    method: FeatureImportanceMethod = "shap"
    backend_model = CONFIG.MODEL_FEATURE_IMPORTANCE_BACKEND_MODEL or DEFAULT_FEATURE_IMPORTANCE_BACKEND_MODEL
    unit_label = "mean absolute SHAP value"

    def calculate(self, data: FeatureImportanceInput) -> list[ModelFeatureImportanceItem]:
        xgboost_module = self._import_xgboost()
        shap_module = self._import_shap()
        class_labels = sorted(set(data.labels))
        label_ids = np.asarray([class_labels.index(label) for label in data.labels], dtype=np.int64)
        class_count = len(class_labels)

        model = xgboost_module.XGBClassifier(
            objective="binary:logistic" if class_count == 2 else "multi:softprob",
            num_class=class_count if class_count > 2 else None,
            n_estimators=CONFIG.MODEL_FEATURE_IMPORTANCE_XGBOOST_N_ESTIMATORS,
            max_depth=CONFIG.MODEL_FEATURE_IMPORTANCE_XGBOOST_MAX_DEPTH,
            learning_rate=CONFIG.MODEL_FEATURE_IMPORTANCE_XGBOOST_LEARNING_RATE,
            random_state=CONFIG.MODEL_FEATURE_IMPORTANCE_XGBOOST_RANDOM_STATE,
            eval_metric="logloss" if class_count == 2 else "mlogloss",
            tree_method="hist",
            n_jobs=1,
        )

        try:
            model.fit(data.features, label_ids)
            explainer = shap_module.TreeExplainer(model)
            raw_shap_values = explainer.shap_values(data.features)
        except Exception as exc:
            raise ModelServiceError(f"Could not calculate SHAP feature importance: {exc}") from exc

        values = self._normalize_shap_values(raw_shap_values, row_count=data.features.shape[0], class_count=class_count)
        if values.ndim == 2:
            importances = np.mean(np.abs(values), axis=0)
        elif values.ndim == 3:
            importances = np.mean(np.abs(values), axis=(0, 2))
        else:
            raise ModelServiceError(f"Unexpected SHAP value shape: {values.shape}.")

        return [
            ModelFeatureImportanceItem(feature=feature_name, importance=float(importance))
            for feature_name, importance in zip(data.feature_names, importances, strict=True)
        ]

    @staticmethod
    def _normalize_shap_values(raw_values, *, row_count: int, class_count: int) -> np.ndarray:
        if hasattr(raw_values, "values"):
            raw_values = raw_values.values

        if isinstance(raw_values, list):
            return np.stack([np.asarray(class_values, dtype=float) for class_values in raw_values], axis=-1)

        values = np.asarray(raw_values, dtype=float)
        if values.ndim == 3 and values.shape[0] == class_count and values.shape[1] == row_count:
            return np.moveaxis(values, 0, -1)
        return values

    @staticmethod
    def _import_xgboost():
        try:
            import xgboost
        except ImportError as exc:
            raise ModelDependencyUnavailableError(
                "XGBoost is required for SHAP feature importance but is not available."
            ) from exc
        return xgboost

    @staticmethod
    def _import_shap():
        try:
            import shap
        except ImportError as exc:
            raise ModelDependencyUnavailableError("SHAP is required for feature importance but is not available.") from exc
        return shap


class FeatureImportanceService:
    _CACHE_LIMIT = 32
    _cache: OrderedDict[tuple[str, ...], ModelFeatureImportanceResponse] = OrderedDict()
    _calculators: dict[FeatureImportanceMethod, FeatureImportanceCalculator] = {
        "shap": ShapXgboostFeatureImportanceCalculator()
    }

    @classmethod
    def get_patient_embedding_feature_importance(
        cls,
        *,
        dataset_id: str,
        model_name: str,
        source: TimeseriesSource,
        method: FeatureImportanceMethod = DEFAULT_FEATURE_IMPORTANCE_METHOD,
        target_column: FeatureImportanceTargetColumn = "true_label",
    ) -> ModelFeatureImportanceResponse:
        response = PredictionCacheService.get_patient_embeddings(
            dataset_id=dataset_id,
            model_name=model_name,
            source=source,
        )
        return cls.calculate_patient_embedding_feature_importance(
            response=response,
            method=method,
            target_column=target_column,
        )

    @classmethod
    def warm_patient_embedding_feature_importance(
        cls,
        response: ModelPatientEmbeddingsResponse,
        *,
        method: FeatureImportanceMethod = DEFAULT_FEATURE_IMPORTANCE_METHOD,
        target_column: FeatureImportanceTargetColumn = "true_label",
    ) -> ModelFeatureImportanceResponse:
        return cls.calculate_patient_embedding_feature_importance(
            response=response,
            method=method,
            target_column=target_column,
        )

    @classmethod
    def calculate_patient_embedding_feature_importance(
        cls,
        *,
        response: ModelPatientEmbeddingsResponse,
        method: FeatureImportanceMethod = DEFAULT_FEATURE_IMPORTANCE_METHOD,
        target_column: FeatureImportanceTargetColumn = "true_label",
    ) -> ModelFeatureImportanceResponse:
        rows = cls._patient_embedding_rows(response, target_column)
        return cls._calculate_with_cache(
            cache_parts=cls._patient_embedding_cache_parts(
                response=response,
                rows=rows,
                method=method,
                target_column=target_column,
            ),
            rows=rows,
            feature_names=response.feature_names,
            target_column=target_column,
            method=method,
        )

    @classmethod
    def get_window_embedding_feature_importance(
        cls,
        *,
        dataset_id: str,
        subject_id: str,
        model_name: str,
        source: TimeseriesSource,
        method: FeatureImportanceMethod = DEFAULT_FEATURE_IMPORTANCE_METHOD,
        target_column: FeatureImportanceTargetColumn = "predicted_label",
    ) -> ModelFeatureImportanceResponse:
        response = PredictionCacheService.get_subject_window_embeddings(
            dataset_id=dataset_id,
            subject_id=subject_id,
            model_name=model_name,
            source=source,
        )
        return cls.calculate_window_embedding_feature_importance(
            response=response,
            method=method,
            target_column=target_column,
        )

    @classmethod
    def warm_window_embedding_feature_importance(
        cls,
        response: ModelWindowEmbeddingsResponse,
        *,
        method: FeatureImportanceMethod = DEFAULT_FEATURE_IMPORTANCE_METHOD,
        target_column: FeatureImportanceTargetColumn = "predicted_label",
    ) -> ModelFeatureImportanceResponse:
        return cls.calculate_window_embedding_feature_importance(
            response=response,
            method=method,
            target_column=target_column,
        )

    @classmethod
    def calculate_window_embedding_feature_importance(
        cls,
        *,
        response: ModelWindowEmbeddingsResponse,
        method: FeatureImportanceMethod = DEFAULT_FEATURE_IMPORTANCE_METHOD,
        target_column: FeatureImportanceTargetColumn = "predicted_label",
    ) -> ModelFeatureImportanceResponse:
        rows = cls._window_embedding_rows(response, target_column)
        return cls._calculate_with_cache(
            cache_parts=cls._window_embedding_cache_parts(
                response=response,
                rows=rows,
                method=method,
                target_column=target_column,
            ),
            rows=rows,
            feature_names=response.feature_names,
            target_column=target_column,
            method=method,
        )

    @staticmethod
    def _patient_embedding_rows(
        response: ModelPatientEmbeddingsResponse,
        target_column: FeatureImportanceTargetColumn,
    ) -> list[tuple[list[float] | None, str | None]]:
        return [
            (point.raw_embedding, point.true_label if target_column == "true_label" else point.predicted_label)
            for point in response.points
        ]

    @staticmethod
    def _window_embedding_rows(
        response: ModelWindowEmbeddingsResponse,
        target_column: FeatureImportanceTargetColumn,
    ) -> list[tuple[list[float] | None, str | None]]:
        return [
            (point.raw_embedding, point.predicted_label if target_column == "predicted_label" else None)
            for point in response.points
        ]

    @classmethod
    def _patient_embedding_cache_parts(
        cls,
        *,
        response: ModelPatientEmbeddingsResponse,
        rows: list[tuple[list[float] | None, str | None]],
        method: FeatureImportanceMethod,
        target_column: FeatureImportanceTargetColumn,
    ) -> tuple[str, ...]:
        return (
            "patient",
            response.dataset_id,
            response.model_name,
            response.source,
            response.checkpoint_signature,
            target_column,
            method,
            cls._config_signature(),
            cls._rows_signature(rows),
        )

    @classmethod
    def _window_embedding_cache_parts(
        cls,
        *,
        response: ModelWindowEmbeddingsResponse,
        rows: list[tuple[list[float] | None, str | None]],
        method: FeatureImportanceMethod,
        target_column: FeatureImportanceTargetColumn,
    ) -> tuple[str, ...]:
        return (
            "window",
            response.dataset_id,
            response.subject_id,
            response.model_name,
            response.source,
            response.checkpoint_signature,
            target_column,
            method,
            cls._config_signature(),
            cls._rows_signature(rows),
        )

    @classmethod
    def _calculate_with_cache(
        cls,
        *,
        cache_parts: tuple[str, ...],
        rows: list[tuple[list[float] | None, str | None]],
        feature_names: list[str],
        target_column: FeatureImportanceTargetColumn,
        method: FeatureImportanceMethod,
    ) -> ModelFeatureImportanceResponse:
        if method not in cls._calculators:
            raise ModelValidationError(f"Unsupported feature importance method '{method}'.")

        cache_key = tuple(str(part) for part in cache_parts)
        cached_response = cls._cache.get(cache_key)
        if cached_response is not None:
            cls._cache.move_to_end(cache_key)
            return cached_response

        calculator = cls._calculators[method]
        data = cls._prepare_input(rows=rows, feature_names=feature_names, target_column=target_column)
        if data.features.shape[0] < CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_ROWS:
            return cls._remember(
                cache_key,
                cls._empty_response(calculator, target_column=target_column, status="insufficient_data"),
            )
        if len(set(data.labels)) < CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_CLASSES:
            return cls._remember(
                cache_key,
                cls._empty_response(calculator, target_column=target_column, status="insufficient_classes"),
            )

        feature_importances = calculator.calculate(data)
        response = ModelFeatureImportanceResponse(
            status="ok",
            method=calculator.method,
            backend_model=calculator.backend_model,
            target_column=target_column,
            unit_label=calculator.unit_label,
            feature_importances=feature_importances,
        )
        return cls._remember(cache_key, response)

    @staticmethod
    def _prepare_input(
        *,
        rows: list[tuple[list[float] | None, str | None]],
        feature_names: list[str],
        target_column: FeatureImportanceTargetColumn,
    ) -> FeatureImportanceInput:
        expected_dimension = len(feature_names)
        features: list[list[float]] = []
        labels: list[str] = []

        for raw_embedding, label in rows:
            if not raw_embedding or not label or len(raw_embedding) != expected_dimension:
                continue
            embedding = np.asarray(raw_embedding, dtype=float)
            if embedding.ndim != 1 or not np.all(np.isfinite(embedding)):
                continue

            features.append(embedding.astype(float).tolist())
            labels.append(label)

        if expected_dimension == 0:
            feature_matrix = np.empty((0, 0), dtype=float)
        else:
            feature_matrix = np.asarray(features, dtype=float).reshape((len(features), expected_dimension))

        return FeatureImportanceInput(
            features=feature_matrix,
            labels=tuple(labels),
            feature_names=tuple(feature_names),
            target_column=target_column,
        )

    @classmethod
    def _remember(
        cls,
        cache_key: tuple[str, ...],
        response: ModelFeatureImportanceResponse,
    ) -> ModelFeatureImportanceResponse:
        cls._cache[cache_key] = response
        cls._cache.move_to_end(cache_key)
        while len(cls._cache) > cls._CACHE_LIMIT:
            cls._cache.popitem(last=False)
        return response

    @staticmethod
    def _empty_response(
        calculator: FeatureImportanceCalculator,
        *,
        target_column: FeatureImportanceTargetColumn,
        status: FeatureImportanceStatus,
    ) -> ModelFeatureImportanceResponse:
        return ModelFeatureImportanceResponse(
            status=status,
            method=calculator.method,
            backend_model=calculator.backend_model,
            target_column=target_column,
            unit_label=calculator.unit_label,
            feature_importances=[],
        )

    @staticmethod
    def _config_signature() -> str:
        return ":".join(
            str(value)
            for value in (
                CONFIG.MODEL_FEATURE_IMPORTANCE_BACKEND_MODEL,
                CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_ROWS,
                CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_CLASSES,
                CONFIG.MODEL_FEATURE_IMPORTANCE_XGBOOST_N_ESTIMATORS,
                CONFIG.MODEL_FEATURE_IMPORTANCE_XGBOOST_MAX_DEPTH,
                CONFIG.MODEL_FEATURE_IMPORTANCE_XGBOOST_LEARNING_RATE,
                CONFIG.MODEL_FEATURE_IMPORTANCE_XGBOOST_RANDOM_STATE,
            )
        )

    @staticmethod
    def _rows_signature(rows: list[tuple[list[float] | None, str | None]]) -> str:
        digest = hashlib.sha256()
        for raw_embedding, label in rows:
            digest.update(str(label).encode("utf-8"))
            digest.update(b"\0")
            if raw_embedding:
                digest.update(np.asarray(raw_embedding, dtype=np.float64).tobytes())
            digest.update(b"\n")
        return digest.hexdigest()[:16]
