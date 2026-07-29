from __future__ import annotations

import unittest
from unittest.mock import patch

import numpy as np

from backend.app import create_app
from backend.services.prediction_cache_service import PredictionCacheService


class EmbeddingApiTest(unittest.TestCase):
    def test_embedding_endpoints_document_pca_as_default_and_accept_all_methods(self):
        schema = create_app().openapi()
        paths = (
            "/models/{model_name}/datasets/{dataset_id}/patient-embeddings",
            "/models/{model_name}/datasets/{dataset_id}/patient-embeddings/raw-embeddings",
            "/models/{model_name}/datasets/{dataset_id}/subjects/{subject_id}/window-embeddings",
            "/models/{model_name}/datasets/{dataset_id}/subjects/{subject_id}/window-embeddings/raw-embeddings",
        )

        for path in paths:
            with self.subTest(path=path):
                parameters = schema["paths"][path]["get"]["parameters"]
                reduction_parameter = next(item for item in parameters if item["name"] == "reduction_method")
                self.assertEqual(reduction_parameter["schema"]["default"], "pca")
                self.assertEqual(reduction_parameter["schema"]["enum"], ["pca", "tsne", "umap"])

    @patch("backend.services.prediction_cache_service.write_clustering_artifact")
    @patch("backend.services.prediction_cache_service.cluster_embeddings_density")
    @patch("backend.services.prediction_cache_service.reduce_embeddings")
    def test_window_clustering_uses_raw_vectors_independently_of_reduction(
        self,
        reduce_embeddings_mock,
        cluster_embeddings_mock,
        write_clustering_artifact_mock,
    ):
        vectors = np.asarray([[1.0, 2.0], [2.0, 3.0], [3.0, 4.0], [4.0, 5.0]])
        coordinates = np.asarray([[0.0, 0.0], [1.0, 1.0], [2.0, 2.0], [3.0, 3.0]])
        reduce_embeddings_mock.return_value = (coordinates, [], "ok")
        cluster_embeddings_mock.return_value = [7, 7, None, 8]
        artifact = {
            "response": {
                "dataset_id": "dataset",
                "subject_id": "subject",
                "source": "derivatives",
                "window_size_seconds": 4.0,
                "sampling_frequency": 125.0,
                "predictions": [
                    {
                        "window_index": index,
                        "start_time": float(index * 4),
                        "end_time": float((index + 1) * 4),
                        "predicted_class_id": 0,
                        "predicted_label": "H",
                        "confidence": 0.9,
                        "probabilities": {"H": 0.9, "AD": 0.1},
                    }
                    for index in range(4)
                ],
            },
            "window_embeddings": {"values": vectors.tolist(), "dimension": 2},
        }

        response = PredictionCacheService._subject_window_embeddings_response(
            dataset_id="dataset",
            subject_id="subject",
            model_name="model",
            source="derivatives",
            checkpoint_signature="signature",
            checkpoint_key="key",
            artifact=artifact,
            clustering_artifact=None,
            include_raw_embeddings=False,
            reduction_method="umap",
        )

        reduce_embeddings_mock.assert_called_once()
        np.testing.assert_array_equal(reduce_embeddings_mock.call_args.args[0], vectors)
        self.assertEqual(reduce_embeddings_mock.call_args.args[1], "umap")
        cluster_embeddings_mock.assert_called_once()
        np.testing.assert_array_equal(cluster_embeddings_mock.call_args.args[0], vectors)
        self.assertEqual([point.cluster_id for point in response.points], [7, 7, None, 8])
        self.assertEqual(response.reduction.method, "umap")
        write_clustering_artifact_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
