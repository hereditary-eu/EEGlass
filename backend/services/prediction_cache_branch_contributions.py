from __future__ import annotations

import numpy as np

from backend.pydantic_models.class_evidence import ModelClassWeightsResponse
from backend.pydantic_models.prediction_cache import (
    ModelBranchContributionStats,
    ModelBranchContributionSummary,
    ModelContributionDistribution,
)

_EPSILON = 1e-12


def build_branch_contribution_summary(
    window_features: list[list[float]] | np.ndarray,
    class_weights: ModelClassWeightsResponse,
) -> ModelBranchContributionSummary:
    """Summarize window branch shares, band dispersion, and the cancellation fraction."""
    features = np.asarray(window_features, dtype=np.float64)
    weights, bp_feature_count = _dense_weight_matrix(class_weights)
    if features.ndim != 2 or features.shape[0] < 1:
        raise ValueError("Branch contribution summaries require at least one window feature vector.")
    if features.shape[1] != weights.shape[1]:
        raise ValueError(
            f"Window feature dimension {features.shape[1]} does not match dense weight dimension {weights.shape[1]}."
        )
    if not np.isfinite(features).all() or not np.isfinite(weights).all():
        raise ValueError("Branch contribution summaries require finite features and weights.")

    contributions = features[:, np.newaxis, :] * weights[np.newaxis, :, :]
    branch_contributions = {
        "bp": contributions[:, :, :bp_feature_count],
        "scc": contributions[:, :, bp_feature_count:],
    }
    magnitudes = {branch: np.abs(values.sum(axis=2)).sum(axis=1) for branch, values in branch_contributions.items()}
    total_magnitude = magnitudes["bp"] + magnitudes["scc"]
    valid_windows = total_magnitude > _EPSILON
    if not np.any(valid_windows):
        raise ValueError("Branch contribution summaries require at least one window with non-zero contribution.")

    branches = []
    for branch in ("bp", "scc"):
        values = branch_contributions[branch]
        share = magnitudes[branch][valid_windows] / total_magnitude[valid_windows]
        addend_magnitude = np.abs(values).sum(axis=(1, 2))
        valid_addends = addend_magnitude > _EPSILON
        spread = _normalized_addend_spread(values[valid_addends])
        cancellation = np.clip(
            1 - magnitudes[branch][valid_addends] / addend_magnitude[valid_addends],
            0,
            1,
        )
        branches.append(
            ModelBranchContributionStats(
                branch=branch,
                share=_distribution(share),
                addend_spread=_distribution(spread) if spread.size else None,
                cancellation=_distribution(cancellation) if cancellation.size else None,
            )
        )

    return ModelBranchContributionSummary(
        window_count=int(features.shape[0]),
        analyzed_window_count=int(np.count_nonzero(valid_windows)),
        branches=branches,
    )


def _dense_weight_matrix(class_weights: ModelClassWeightsResponse) -> tuple[np.ndarray, int]:
    if class_weights.scc is None or not class_weights.bands or not class_weights.scc.bands:
        raise ValueError("Branch contribution summaries require BP and SCC class weights.")
    bands = [*class_weights.bands, *class_weights.scc.bands]
    class_ids = sorted(weight.class_id for weight in bands[0].class_weights)
    matrix = np.asarray(
        [
            [next(weight.weight for weight in band.class_weights if weight.class_id == class_id) for band in bands]
            for class_id in class_ids
        ],
        dtype=np.float64,
    )
    return matrix, len(class_weights.bands)


def _normalized_addend_spread(contributions: np.ndarray) -> np.ndarray:
    if contributions.size == 0:
        return np.asarray([], dtype=np.float64)
    absolute_by_band = np.abs(contributions).sum(axis=1)
    proportions = absolute_by_band / absolute_by_band.sum(axis=1, keepdims=True)
    band_count = proportions.shape[1]
    if band_count <= 1:
        return np.zeros(proportions.shape[0], dtype=np.float64)
    spread = band_count / (band_count - 1) * np.square(proportions - 1 / band_count).sum(axis=1)
    return np.clip(spread, 0, 1)


def _distribution(values: np.ndarray) -> ModelContributionDistribution:
    lower, upper = np.quantile(values, [0.025, 0.975])
    return ModelContributionDistribution(
        mean=float(np.mean(values)),
        lower_95=float(lower),
        upper_95=float(upper),
    )
