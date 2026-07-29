from __future__ import annotations

import unittest
from typing import cast
from unittest.mock import patch

import numpy as np

from backend.pydantic_models.embeddings import EmbeddingReductionMethod
from backend.services.embedding_service import EmbeddingReductionError, reduce_embeddings


class EmbeddingServiceTest(unittest.TestCase):
    def test_pca_reduces_to_two_finite_dimensions_and_reports_variance(self):
        vectors = np.asarray([[1.0], [2.0], [4.0]])

        coordinates, explained_variance_ratio, status = reduce_embeddings(vectors)

        self.assertEqual(status, "ok")
        self.assertEqual(coordinates.shape, (3, 2))
        self.assertTrue(np.all(np.isfinite(coordinates)))
        self.assertEqual(explained_variance_ratio, [1.0, 0.0])

    def test_reducers_enforce_method_specific_minimum_sample_counts(self):
        cases = (("pca", 1), ("tsne", 30), ("umap", 3))

        for method, sample_count in cases:
            with self.subTest(method=method):
                coordinates, explained_variance_ratio, status = reduce_embeddings(
                    np.ones((sample_count, 3)), cast(EmbeddingReductionMethod, method)
                )
                self.assertEqual(status, "insufficient_data")
                self.assertEqual(coordinates.shape, (0, 2))
                self.assertEqual(explained_variance_ratio, [])

    @patch("sklearn.manifold.TSNE")
    def test_tsne_uses_library_defaults(self, tsne_constructor):
        expected = np.column_stack([np.arange(31, dtype=float), np.arange(31, dtype=float) * -1])
        tsne_constructor.return_value.fit_transform.return_value = expected
        vectors = np.ones((31, 4))

        coordinates, explained_variance_ratio, status = reduce_embeddings(vectors, "tsne")

        tsne_constructor.assert_called_once_with()
        np.testing.assert_array_equal(tsne_constructor.return_value.fit_transform.call_args.args[0], vectors)
        np.testing.assert_array_equal(coordinates, expected)
        self.assertEqual(explained_variance_ratio, [])
        self.assertEqual(status, "ok")

    @patch("umap.UMAP")
    def test_umap_uses_library_defaults(self, umap_constructor):
        expected = np.asarray([[0.0, 1.0], [1.0, 2.0], [2.0, 3.0], [3.0, 4.0]])
        umap_constructor.return_value.fit_transform.return_value = expected
        vectors = np.ones((4, 3))

        coordinates, explained_variance_ratio, status = reduce_embeddings(vectors, "umap")

        umap_constructor.assert_called_once_with()
        np.testing.assert_array_equal(umap_constructor.return_value.fit_transform.call_args.args[0], vectors)
        np.testing.assert_array_equal(coordinates, expected)
        self.assertEqual(explained_variance_ratio, [])
        self.assertEqual(status, "ok")

    @patch("sklearn.manifold.TSNE")
    def test_nonlinear_reducer_failure_has_method_context(self, tsne_constructor):
        tsne_constructor.return_value.fit_transform.side_effect = ValueError("bad input")

        with self.assertRaisesRegex(EmbeddingReductionError, "Unable to reduce embeddings with tsne: bad input"):
            reduce_embeddings(np.ones((31, 3)), "tsne")

    def test_invalid_method_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unsupported embedding reduction method"):
            reduce_embeddings(np.ones((31, 3)), cast(EmbeddingReductionMethod, "invalid"))


if __name__ == "__main__":
    unittest.main()
