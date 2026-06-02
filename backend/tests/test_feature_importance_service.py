from __future__ import annotations

import unittest
from collections import OrderedDict

import numpy as np

from backend.config import CONFIG
from backend.pydantic_models.embeddings import (
    ModelPatientEmbeddingPoint,
    ModelPatientEmbeddingReduction,
    ModelPatientEmbeddingsResponse,
    ModelWindowEmbeddingPoint,
    ModelWindowEmbeddingsResponse,
)
from backend.pydantic_models.feature_importance import ModelFeatureImportanceItem
from backend.services.feature_importance_service import (
    FeatureImportanceService,
    ShapXgboostFeatureImportanceCalculator,
)
from backend.services.prediction_cache_service import PredictionCacheService


class DummyCalculator:
    method = "shap"
    backend_model = "dummy"
    unit_label = "dummy importance"

    def __init__(self):
        self.calls = 0
        self.last_labels: tuple[str, ...] = ()

    def calculate(self, data):
        self.calls += 1
        self.last_labels = data.labels
        return [
            ModelFeatureImportanceItem(feature=feature_name, importance=float(index + 1))
            for index, feature_name in enumerate(data.feature_names)
        ]


class FeatureImportanceServiceTest(unittest.TestCase):
    def setUp(self):
        self.original_calculators = FeatureImportanceService._calculators
        self.original_cache = FeatureImportanceService._cache
        self.original_min_rows = CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_ROWS
        self.original_min_classes = CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_CLASSES
        FeatureImportanceService._cache = OrderedDict()
        CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_ROWS = 3
        CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_CLASSES = 2

    def tearDown(self):
        FeatureImportanceService._calculators = self.original_calculators
        FeatureImportanceService._cache = self.original_cache
        CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_ROWS = self.original_min_rows
        CONFIG.MODEL_FEATURE_IMPORTANCE_MIN_CLASSES = self.original_min_classes

    def test_returns_insufficient_data_before_calculating(self):
        calculator = DummyCalculator()
        FeatureImportanceService._calculators = {"shap": calculator}

        response = FeatureImportanceService._calculate_with_cache(
            cache_parts=("test", "insufficient-data"),
            rows=[([1.0, 2.0], "A")],
            feature_names=["alpha", "beta"],
            target_column="true_label",
            method="shap",
        )

        self.assertEqual(response.status, "insufficient_data")
        self.assertEqual(response.feature_importances, [])
        self.assertEqual(calculator.calls, 0)

    def test_returns_insufficient_classes_before_calculating(self):
        calculator = DummyCalculator()
        FeatureImportanceService._calculators = {"shap": calculator}

        response = FeatureImportanceService._calculate_with_cache(
            cache_parts=("test", "insufficient-classes"),
            rows=[([1.0, 2.0], "A"), ([1.5, 2.5], "A"), ([2.0, 3.0], "A")],
            feature_names=["alpha", "beta"],
            target_column="true_label",
            method="shap",
        )

        self.assertEqual(response.status, "insufficient_classes")
        self.assertEqual(response.feature_importances, [])
        self.assertEqual(calculator.calls, 0)

    def test_calculates_and_caches_feature_importance(self):
        calculator = DummyCalculator()
        FeatureImportanceService._calculators = {"shap": calculator}
        rows = [
            ([1.0, 2.0], "B"),
            ([1.5, 2.5], "A"),
            ([2.0, 3.0], "B"),
            ([2.5, 3.5], "A"),
        ]

        first = FeatureImportanceService._calculate_with_cache(
            cache_parts=("test", "ok"),
            rows=rows,
            feature_names=["alpha", "beta"],
            target_column="predicted_label",
            method="shap",
        )
        second = FeatureImportanceService._calculate_with_cache(
            cache_parts=("test", "ok"),
            rows=rows,
            feature_names=["alpha", "beta"],
            target_column="predicted_label",
            method="shap",
        )

        self.assertIs(first, second)
        self.assertEqual(first.status, "ok")
        self.assertEqual([item.importance for item in first.feature_importances], [1.0, 2.0])
        self.assertEqual(calculator.last_labels, ("B", "A", "B", "A"))
        self.assertEqual(calculator.calls, 1)

    def test_warmed_window_feature_importance_is_reused_by_endpoint_service(self):
        calculator = DummyCalculator()
        FeatureImportanceService._calculators = {"shap": calculator}
        response = make_window_embeddings_response()
        original_get_subject_window_embeddings = PredictionCacheService.__dict__["get_subject_window_embeddings"]
        PredictionCacheService.get_subject_window_embeddings = staticmethod(lambda **_kwargs: response)

        try:
            warmed = FeatureImportanceService.warm_window_embedding_feature_importance(response)
            loaded = FeatureImportanceService.get_window_embedding_feature_importance(
                dataset_id=response.dataset_id,
                subject_id=response.subject_id,
                model_name=response.model_name,
                source=response.source,
            )
        finally:
            PredictionCacheService.get_subject_window_embeddings = original_get_subject_window_embeddings

        self.assertIs(warmed, loaded)
        self.assertEqual(warmed.status, "ok")
        self.assertEqual(calculator.calls, 1)

    def test_warmed_patient_feature_importance_is_reused_by_endpoint_service(self):
        calculator = DummyCalculator()
        FeatureImportanceService._calculators = {"shap": calculator}
        response = make_patient_embeddings_response()
        original_get_patient_embeddings = PredictionCacheService.__dict__["get_patient_embeddings"]
        PredictionCacheService.get_patient_embeddings = staticmethod(lambda **_kwargs: response)

        try:
            warmed = FeatureImportanceService.warm_patient_embedding_feature_importance(response)
            loaded = FeatureImportanceService.get_patient_embedding_feature_importance(
                dataset_id=response.dataset_id,
                model_name=response.model_name,
                source=response.source,
            )
        finally:
            PredictionCacheService.get_patient_embeddings = original_get_patient_embeddings

        self.assertIs(warmed, loaded)
        self.assertEqual(warmed.status, "ok")
        self.assertEqual(calculator.calls, 1)

    def test_response_based_warmup_keeps_insufficient_data_guard(self):
        calculator = DummyCalculator()
        FeatureImportanceService._calculators = {"shap": calculator}
        response = make_window_embeddings_response(
            points=[
                ModelWindowEmbeddingPoint(
                    window_index=0,
                    start_time=0.0,
                    end_time=4.0,
                    x=0.0,
                    y=0.0,
                    raw_embedding=[1.0, 2.0],
                    predicted_label="A",
                    confidence=0.9,
                )
            ],
        )

        warmed = FeatureImportanceService.warm_window_embedding_feature_importance(response)

        self.assertEqual(warmed.status, "insufficient_data")
        self.assertEqual(warmed.feature_importances, [])
        self.assertEqual(calculator.calls, 0)


class ShapXgboostFeatureImportanceCalculatorTest(unittest.TestCase):
    def test_normalizes_list_and_class_first_shap_values(self):
        list_values = [np.ones((2, 3)), np.full((2, 3), 2.0)]
        normalized_list = ShapXgboostFeatureImportanceCalculator._normalize_shap_values(
            list_values,
            row_count=2,
            class_count=2,
        )
        class_first_values = np.zeros((2, 4, 3), dtype=float)
        normalized_class_first = ShapXgboostFeatureImportanceCalculator._normalize_shap_values(
            class_first_values,
            row_count=4,
            class_count=2,
        )

        self.assertEqual(normalized_list.shape, (2, 3, 2))
        self.assertEqual(normalized_class_first.shape, (4, 3, 2))

    def test_categorical_labels_are_encoded_deterministically(self):
        captured_labels = []

        class FakeModel:
            def fit(self, _features, labels):
                captured_labels.extend(labels.tolist())

        class FakeXgboostModule:
            @staticmethod
            def XGBClassifier(**_kwargs):
                return FakeModel()

        class FakeExplainer:
            def __init__(self, _model):
                pass

            def shap_values(self, features):
                return np.zeros_like(features, dtype=float)

        class FakeShapModule:
            TreeExplainer = FakeExplainer

        original_import_xgboost = ShapXgboostFeatureImportanceCalculator._import_xgboost
        original_import_shap = ShapXgboostFeatureImportanceCalculator._import_shap
        ShapXgboostFeatureImportanceCalculator._import_xgboost = staticmethod(lambda: FakeXgboostModule)
        ShapXgboostFeatureImportanceCalculator._import_shap = staticmethod(lambda: FakeShapModule)
        try:
            data = FeatureImportanceService._prepare_input(
                rows=[
                    ([1.0, 2.0], "Beta"),
                    ([1.5, 2.5], "Alpha"),
                    ([2.0, 3.0], "Beta"),
                    ([2.5, 3.5], "Alpha"),
                ],
                feature_names=["alpha", "beta"],
                target_column="true_label",
            )
            ShapXgboostFeatureImportanceCalculator().calculate(data)
        finally:
            ShapXgboostFeatureImportanceCalculator._import_xgboost = original_import_xgboost
            ShapXgboostFeatureImportanceCalculator._import_shap = original_import_shap

        self.assertEqual(captured_labels, [1, 0, 1, 0])


def make_reduction(source_dimension: int = 2) -> ModelPatientEmbeddingReduction:
    return ModelPatientEmbeddingReduction(
        method="pca",
        status="ok",
        source_dimension=source_dimension,
        output_dimension=2,
        explained_variance_ratio=[0.7, 0.3],
    )


def make_patient_embeddings_response() -> ModelPatientEmbeddingsResponse:
    return ModelPatientEmbeddingsResponse(
        dataset_id="dataset",
        model_name="model",
        source="derivatives",
        checkpoint_signature="checkpoint",
        checkpoint_key="checkpoint-key",
        preprocessing_version="preprocessing",
        embedding_layer="penultimate",
        embedding_label="Penultimate",
        feature_names=["alpha", "beta"],
        reduction=make_reduction(),
        points=[
            ModelPatientEmbeddingPoint(
                subject_id="sub-001",
                x=0.0,
                y=0.0,
                raw_embedding=[1.0, 2.0],
                true_label="B",
                predicted_label="B",
                mean_confidence=0.9,
                total_windows=10,
            ),
            ModelPatientEmbeddingPoint(
                subject_id="sub-002",
                x=1.0,
                y=1.0,
                raw_embedding=[1.5, 2.5],
                true_label="A",
                predicted_label="A",
                mean_confidence=0.8,
                total_windows=10,
            ),
            ModelPatientEmbeddingPoint(
                subject_id="sub-003",
                x=2.0,
                y=2.0,
                raw_embedding=[2.0, 3.0],
                true_label="B",
                predicted_label="B",
                mean_confidence=0.7,
                total_windows=10,
            ),
            ModelPatientEmbeddingPoint(
                subject_id="sub-004",
                x=3.0,
                y=3.0,
                raw_embedding=[2.5, 3.5],
                true_label="A",
                predicted_label="A",
                mean_confidence=0.6,
                total_windows=10,
            ),
        ],
    )


def make_window_embeddings_response(
    points: list[ModelWindowEmbeddingPoint] | None = None,
) -> ModelWindowEmbeddingsResponse:
    return ModelWindowEmbeddingsResponse(
        dataset_id="dataset",
        subject_id="sub-001",
        model_name="model",
        source="derivatives",
        checkpoint_signature="checkpoint",
        embedding_layer="penultimate",
        embedding_label="Penultimate",
        feature_names=["alpha", "beta"],
        reduction=make_reduction(),
        points=points
        or [
            ModelWindowEmbeddingPoint(
                window_index=0,
                start_time=0.0,
                end_time=4.0,
                x=0.0,
                y=0.0,
                raw_embedding=[1.0, 2.0],
                predicted_label="B",
                confidence=0.9,
            ),
            ModelWindowEmbeddingPoint(
                window_index=1,
                start_time=4.0,
                end_time=8.0,
                x=1.0,
                y=1.0,
                raw_embedding=[1.5, 2.5],
                predicted_label="A",
                confidence=0.8,
            ),
            ModelWindowEmbeddingPoint(
                window_index=2,
                start_time=8.0,
                end_time=12.0,
                x=2.0,
                y=2.0,
                raw_embedding=[2.0, 3.0],
                predicted_label="B",
                confidence=0.7,
            ),
            ModelWindowEmbeddingPoint(
                window_index=3,
                start_time=12.0,
                end_time=16.0,
                x=3.0,
                y=3.0,
                raw_embedding=[2.5, 3.5],
                predicted_label="A",
                confidence=0.6,
            ),
        ],
    )


if __name__ == "__main__":
    unittest.main()
