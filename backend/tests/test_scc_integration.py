"""Run with: python -m unittest discover -s backend/tests -v."""

import csv
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import torch
from fastapi.testclient import TestClient

from backend.app import app
from backend.ml.model_registry import get_model_spec, list_model_specs
from backend.ml.scc_cache import SCCStore, calc_mean_scc_per_channel, compute_scc_windows
from backend.services.model_errors import ModelNotFoundError, ModelServiceError, ModelValidationError
from backend.services.model_service import (
    ModelRuntime,
    ModelService,
    PreparedSubjectData,
    compute_class_evidence_response,
    compute_window_scalp_topology_response,
)
from backend.services.scc_service import SCCService
from backend.services.timeseries_service import TimeseriesService


class SCCIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.spec = get_model_spec("xeegnet_scc_model_reducermode_node_v200")
        rng = np.random.default_rng(7)
        self.windows = rng.normal(0, 10, (3, 19, 500)).astype("float32")
        self.pairs = rng.uniform(0, 1, (3, 7, 171)).astype("float32")
        self.data = PreparedSubjectData(self.windows, 125, [(0, 4), (4, 8), (8, 12)])

    def test_registry_and_all_checkpoints(self):
        self.assertEqual(len(list_model_specs()), 10)
        self.assertEqual(sum(s.model_kind == "xeegnet_scc" for s in list_model_specs()), 5)
        for spec in list_model_specs():
            with self.subTest(spec=spec.name):
                model = ModelRuntime.get_model(torch, spec)
                pairs = self.pairs if spec.scc_reducer else None
                result = ModelRuntime.extract_features(spec, self.windows, pairs)
                with torch.no_grad():
                    direct = (
                        model([torch.from_numpy(self.windows), torch.from_numpy(pairs)])
                        if pairs is not None
                        else model(torch.from_numpy(self.windows))
                    )
                torch.testing.assert_close(result["logits"], direct)
                self.assertEqual(result["features"].shape, (3, 14 if pairs is not None else 7))
                probs, _ = ModelRuntime.run_inference_with_embeddings(spec, self.windows, pairs)
                np.testing.assert_allclose(probs.sum(1), 1, atol=1e-6)
                self.assertFalse(model.training)

    def test_explanations_reconstruct_full_logits_and_node_output(self):
        model = ModelRuntime.get_model(torch, self.spec)
        with patch.object(SCCService, "pairs", return_value=self.pairs):
            response = compute_class_evidence_response(
                model_spec=self.spec,
                subject_data=self.data,
                dataset_id="fixture",
                subject_id="sub-001",
                source="derivatives",
                window_index=1,
            )
            topology = compute_window_scalp_topology_response(
                model_spec=self.spec,
                subject_data=self.data,
                dataset_id="fixture",
                subject_id="sub-001",
                source="derivatives",
                window_index=1,
                branch="scc",
            )
        features = ModelRuntime.extract_features(self.spec, self.windows, self.pairs)
        for c in self.spec.classes:
            bp = sum(b.class_contributions[c.class_id].contribution for b in response.bands)
            scc = sum(b.class_contributions[c.class_id].contribution for b in response.scc.bands)
            self.assertAlmostEqual(bp + scc, response.logits[c.label], places=5)
        for i, band in enumerate(topology.modes[0].bands):
            self.assertAlmostEqual(sum(c.value for c in band.channels), float(features["reduced_scc"][1, i]), places=5)
        maps = model.visualization_maps(torch.from_numpy(self.pairs))
        self.assertEqual(maps["spatial_node_weights"].shape, (7, 19))
        np.testing.assert_allclose(maps["band_activation_scc"], features["scc"].numpy())
        self.assertEqual(response.bands[2].end_hz, 12)
        self.assertEqual(response.scc.bands[2].end_hz, 13)

    def test_coherence_excludes_diagonal_and_reference_weighting(self):
        means = calc_mean_scc_per_channel(np.ones((2, 7, 171)), 19)
        np.testing.assert_equal(means, np.ones((2, 7, 19)))
        # Patient 1 has 2 windows at .2, patient 2 has 8 windows at .8.
        # Their equal-weight reference mean is .5, not the pooled-window mean .68.
        patient_means = np.stack([np.full((7, 19), 0.2), np.full((7, 19), 0.8)])
        stats = SCCService.statistics_response(
            self.spec, "fixture", "sub-001", patient_means, "inter_patient", window_count=10
        )
        self.assertAlmostEqual(stats.channels[0].bands[0].mean, 0.5)
        self.assertAlmostEqual(stats.channels[0].bands[0].lower_2sigma, -0.1)
        self.assertEqual(stats.subject_count, 2)
        self.assertEqual(stats.window_count, 10)

    def test_cache_cold_warm_concurrent_and_invalid_shape(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SCCStore(Path(directory))
            SCCService._memory.clear()
            with (
                patch.object(SCCService, "store", return_value=store),
                patch("backend.ml.scc_cache.compute_scc_windows", return_value=self.pairs) as compute,
            ):

                def request(_):
                    return SCCService.pairs(self.spec, "fixture", "sub-001", "derivatives", self.windows)

                with ThreadPoolExecutor(max_workers=4) as pool:
                    results = list(pool.map(request, range(8)))
                self.assertEqual(compute.call_count, 1)
                for result in results:
                    np.testing.assert_array_equal(result, self.pairs)
                SCCService._memory.clear()
                request(0)
                self.assertEqual(compute.call_count, 1)
                store.put(
                    "fixture", "sub-001", "derivatives", self.pairs[:1], SCCService.params(self.spec), 19, verbose=False
                )
                SCCService._memory.clear()
                request(0)
                self.assertEqual(compute.call_count, 2)
            SCCService._memory.clear()

    def test_incomplete_reference_and_baseline_scc_rejected(self):
        with patch(
            "backend.services.prediction_cache_service.PredictionCacheService.get_cache_status",
            return_value=SimpleNamespace(status="partial"),
        ):
            with self.assertRaises(ModelNotFoundError):
                SCCService.stats(self.spec, "fixture", "sub-001", "derivatives", "inter_patient")
        with self.assertRaises(ModelValidationError):
            SCCService.pairs(get_model_spec("xeegnet_model_v200"), "fixture", "sub-001", "derivatives", self.windows)
        with self.assertRaises(ModelValidationError):
            ModelRuntime.extract_features(self.spec, self.windows)

    def test_real_connectivity_transform_and_computation_failure(self):
        pairs = compute_scc_windows(self.windows[:1], SCCService.params(self.spec), 19, n_jobs=1, chunk_size=1)
        self.assertEqual(pairs.shape, (1, 7, 171))
        self.assertTrue(np.isfinite(pairs).all())
        self.assertTrue(np.all((pairs >= 0) & (pairs <= 1)))
        with tempfile.TemporaryDirectory() as directory:
            SCCService._memory.clear()
            with (
                patch.object(SCCService, "store", return_value=SCCStore(Path(directory))),
                patch("backend.ml.scc_cache.compute_scc_windows", side_effect=RuntimeError("fixture failure")),
            ):
                with self.assertRaisesRegex(ModelServiceError, "fixture failure"):
                    SCCService.pairs(self.spec, "fixture-failure", "sub-001", "derivatives", self.windows)

    def test_inter_reference_cohorts_and_artifact_validation(self):
        from backend.services.prediction_cache_artifacts import is_scc_stats_summary_valid

        patient_stats = {}
        for subject, count, value in [("sub-001", 2, 0.2), ("sub-002", 8, 0.8)]:
            patient_stats[subject] = {
                "scc_stats": SCCService.statistics_response(
                    self.spec, "fixture", subject, np.full((count, 7, 19), value), "intra_patient"
                ).model_dump()
            }
        summary = SimpleNamespace(
            status="complete",
            checkpoint_key="fixture",
            subject_summaries=[
                SimpleNamespace(subject_id="sub-001", true_label="Healthy"),
                SimpleNamespace(subject_id="sub-002", true_label="Alzheimer Disease"),
            ],
        )
        with (
            patch(
                "backend.services.prediction_cache_service.PredictionCacheService.get_cache_status",
                return_value=summary,
            ),
            patch(
                "backend.services.prediction_cache_artifacts.read_prediction_artifact",
                side_effect=lambda _d, _m, _k, s, _src: patient_stats[s],
            ),
        ):
            result = SCCService.stats(self.spec, "fixture", "sub-001", "derivatives", "inter_patient")
            self.assertAlmostEqual(result.channels[0].bands[0].mean, 0.5)
            self.assertEqual(result.window_count, 10)
            cohort = SCCService.stats(self.spec, "fixture", "sub-001", "derivatives", "inter_patient", "Healthy")
            self.assertAlmostEqual(cohort.channels[0].bands[0].mean, 0.2)
            self.assertEqual(cohort.subject_count, 1)
        stats = patient_stats["sub-001"]["scc_stats"]
        self.assertTrue(is_scc_stats_summary_valid(stats, self.spec.name))
        stats["channels"][0]["bands"][2]["end_hz"] = 12
        self.assertFalse(is_scc_stats_summary_valid(stats, self.spec.name))

    def test_export_uses_classifier_feature_names_and_cache_signature(self):
        from main import export_patient_embeddings, get_checkpoint_key, get_checkpoint_signature

        with (
            tempfile.TemporaryDirectory() as directory,
            patch.dict("os.environ", {"MODEL_OUTPUT_STORAGE_DIR": directory}),
        ):
            signature = get_checkpoint_signature(self.spec.name)
            self.assertEqual(signature, ModelRuntime.checkpoint_signature(self.spec))
            cache = Path(directory) / "fixture" / self.spec.name / get_checkpoint_key(signature)
            subjects = cache / "subjects"
            subjects.mkdir(parents=True)
            (subjects / "sub-001.derivatives.predictions.json").write_text(
                json.dumps({"subject_id": "sub-001", "embedding": {"values": list(range(14))}, "summary": {}})
            )
            exported = export_patient_embeddings(dataset_id="fixture", model_name=self.spec.name)
            with exported.open(newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual(rows[0]["bp_delta_activation"], "0.0")
            self.assertEqual(rows[0]["scc_delta_activation"], "7.0")
            self.assertEqual(rows[0]["scc_gamma_activation"], "13.0")

    def test_api_switching_and_branch_contracts(self):
        client = TestClient(app)
        original = ModelService._current_model_name
        try:
            for name in ["xeegnet_model_v200", self.spec.name, "xeegnet_model_v200"]:
                r = client.put("/models/current", json={"model_name": name})
                self.assertEqual(r.status_code, 200, r.text)
                self.assertEqual(r.json()["name"], name)
            self.assertEqual(client.get(f"/models/{self.spec.name}/scalp-topologies?branch=scc").status_code, 200)
            self.assertEqual(client.get("/models/xeegnet_model_v200/scalp-topologies?branch=scc").status_code, 400)
            with (
                patch(
                    "backend.services.model_service.SubjectPreprocessingService.get_prepared_subject_data",
                    return_value=self.data,
                ),
                patch.object(SCCService, "pairs", return_value=self.pairs),
            ):
                req = {"dataset_id": "fixture", "subject_id": "sub-001", "source": "derivatives", "window_index": 0}
                r = client.post(f"/models/{self.spec.name}/scc", json=req)
                self.assertEqual(r.status_code, 200, r.text)
                self.assertEqual(len(r.json()["channels"]), 19)
                req["window_index"] = 99
                self.assertEqual(client.post(f"/models/{self.spec.name}/scc", json=req).status_code, 400)
                req["source"] = "raw"
                self.assertEqual(client.post(f"/models/{self.spec.name}/scc", json=req).status_code, 400)
            splits = TimeseriesService._read_model_subject_splits(self.spec.name)
            self.assertEqual(set(splits.values()), {"train", "val", "test"})
            self.assertEqual(len(splits), 88)
        finally:
            ModelService._current_model_name = original


if __name__ == "__main__":
    unittest.main()
