from __future__ import annotations

from typing import Any

import numpy as np

from backend.ml.model_vars import MODEL_BANDS, MODEL_CHANNELS
from backend.pydantic_models.band_power import (
    ModelBandPowerStatsResponse,
    ModelBandPowerStatsValue,
    ModelChannelBandPowerStats,
)
from backend.pydantic_models.timeseries import TimeseriesSource
from backend.services.model_errors import ModelNotFoundError


def extract_band_power_mean_values(band_power_stats: dict[str, Any]) -> np.ndarray:
    return np.asarray(
        [[float(band["mean_db"]) for band in channel["bands"]] for channel in band_power_stats["channels"]],
        dtype=np.float64,
    )


def build_inter_patient_band_power_stats_response(
    *,
    dataset_id: str,
    subject_id: str,
    source: TimeseriesSource,
    patient_mean_values: list[np.ndarray],
) -> ModelBandPowerStatsResponse:
    if not patient_mean_values:
        raise ModelNotFoundError("Inter-patient band-power statistics require a completed dataset compute job.")

    stats_values = np.stack(patient_mean_values, axis=0)
    means = np.mean(stats_values, axis=0)
    stds = np.std(stats_values, axis=0)

    return ModelBandPowerStatsResponse(
        dataset_id=dataset_id,
        subject_id=subject_id,
        source=source,
        mode="inter_patient",
        unit_label="dB re channel total band power",
        subject_count=len(patient_mean_values),
        window_count=0,
        channels=[
            ModelChannelBandPowerStats(
                channel=channel_name,
                bands=[
                    ModelBandPowerStatsValue(
                        band=band_name,
                        start_hz=start_hz,
                        end_hz=end_hz,
                        mean_db=float(means[channel_index, band_index]),
                        lower_2sigma_db=float(means[channel_index, band_index] - 2 * stds[channel_index, band_index]),
                        upper_2sigma_db=float(means[channel_index, band_index] + 2 * stds[channel_index, band_index]),
                        sample_count=len(patient_mean_values),
                    )
                    for band_index, (band_name, start_hz, end_hz) in enumerate(MODEL_BANDS)
                ],
            )
            for channel_index, channel_name in enumerate(MODEL_CHANNELS)
        ],
    )
