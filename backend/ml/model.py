from __future__ import annotations

from itertools import chain, combinations

import torch
import torch.nn as nn
import torch.nn.functional as F
from scipy.signal import firwin

from backend.ml.model_vars import PARAMETERS_DEFAULT


class XEEGNetEncoder(nn.Module):
    def __init__(
        self,
        chans: int,
        sampling_frequency: int,
        f1: int = 7,
        temporal_kernel: int = 125,
        f2: int = 7,
        pool: int = 75,
        dropout: float = 0.2,
        random_temporal_filter: bool = False,
        freeze_temporal: int = int(1e12),
        spatial_depthwise: bool = True,
        log_activation_base: str = "dB",
        norm_type: str = "batchnorm",
        global_pooling: bool = True,
        bias: tuple[bool, bool] = (False, False),
        seed: int | None = None,
    ):
        super().__init__()

        reset_seed(seed)
        self.freeze_temporal = freeze_temporal
        self.do_global_pooling = global_pooling
        self.conv1 = nn.Conv2d(1, f1, (1, temporal_kernel), stride=(1, 1), bias=bias[0])
        if not random_temporal_filter:
            self._initialize_custom_temporal_filter(seed, sampling_frequency)

        self.conv2 = nn.Conv2d(
            f1,
            f2,
            (chans, 1),
            stride=(1, 1),
            groups=f1 if spatial_depthwise else 1,
            bias=bias[1],
        )

        if "batch" in norm_type.casefold():
            self.batch1 = nn.BatchNorm2d(f2, affine=True)
        elif "instance" in norm_type.casefold():
            self.batch1 = nn.InstanceNorm2d(f2)
        else:
            raise ValueError("normalization layer type can be 'batchnorm' or 'instancenorm'")

        if log_activation_base in ("e", torch.e):
            self.log_activation = lambda x: torch.log(torch.clamp(x, 1e-7, 1e4))
        elif log_activation_base in ("10", 10):
            self.log_activation = lambda x: torch.log10(torch.clamp(x, 1e-7, 1e4))
        elif log_activation_base in ("db", "dB"):
            self.log_activation = lambda x: 10 * torch.log10(torch.clamp(x, 1e-7, 1e4))
        else:
            raise ValueError("allowed activation bases are 'e', '10', and 'dB'")

        if global_pooling:
            self.global_pooling = nn.AdaptiveAvgPool2d((1, 1))
        else:
            self.pool2 = nn.AvgPool2d((1, pool), stride=(1, max(1, pool // 5)))

        self.drop1 = nn.Dropout(dropout)
        self.flatten = nn.Flatten()

    def forward(self, x):
        if self.freeze_temporal:
            self.freeze_temporal -= 1
            self.conv1.requires_grad_(False)
        else:
            self.conv1.requires_grad_(True)

        x = torch.unsqueeze(x, 1)
        x = self.conv1(x)
        x = self.conv2(x)
        x = self.batch1(x)
        x = torch.square(x)
        x = self.global_pooling(x) if self.do_global_pooling else self.pool2(x)
        x = self.log_activation(x)
        x = self.drop1(x)
        return self.flatten(x)

    @torch.no_grad()
    def _initialize_custom_temporal_filter(self, seed: int | None, sampling_frequency: int) -> None:
        reset_seed(seed)
        if self.conv1.weight.shape[-1] >= 75:
            bands = (
                (0.5, 4.0),
                (4.0, 8.0),
                (8.0, 12.0),
                (12.0, 16.0),
                (16.0, 20.0),
                (20.0, 28.0),
                (28.0, 45.0),
            )
        else:
            bands = ((0.5, 8.0), (8.0, 16.0), (16.0, 28.0), (28.0, 45.0))

        filter_count, kernel_length = self.conv1.weight.shape[0], self.conv1.weight.shape[-1]
        for index, band_group in enumerate(powerset(bands)):
            if index >= filter_count:
                break
            coefficients = firwin(
                kernel_length,
                merge_band_edges(band_group),
                pass_zero=False,
                fs=sampling_frequency,
            )
            self.conv1.weight.data[index, 0, 0] = torch.from_numpy(coefficients)


class XEEGNet(nn.Module):
    def __init__(
        self,
        nb_classes: int,
        chans: int,
        samples: int,
        sampling_frequency: int,
        f1: int = 7,
        temporal_kernel: int = 125,
        f2: int = 7,
        pool: int = 75,
        dropout: float = 0.2,
        random_temporal_filter: bool = False,
        freeze_temporal: int = int(1e12),
        spatial_depthwise: bool = True,
        log_activation_base: str = "dB",
        norm_type: str = "batchnorm",
        global_pooling: bool = True,
        bias: tuple[bool, bool, bool] = (False, False, False),
        dense_hidden: int = -1,
        return_logits: bool = True,
        seed: int | None = None,
    ):
        super().__init__()

        self.nb_classes = nb_classes
        self.return_logits = return_logits
        self.encoder = XEEGNetEncoder(
            chans,
            sampling_frequency,
            f1,
            temporal_kernel,
            f2,
            pool,
            dropout,
            random_temporal_filter,
            freeze_temporal,
            spatial_depthwise,
            log_activation_base,
            norm_type,
            global_pooling,
            (bias[0], bias[1]),
            seed,
        )

        self.emb_size = f2 if global_pooling else f2 * ((samples - temporal_kernel + 1 - pool) // max(1, pool // 5) + 1)

        reset_seed(seed)
        output_features = 1 if nb_classes <= 2 else nb_classes
        if dense_hidden <= 0:
            self.Dense = nn.Linear(self.emb_size, output_features, bias=bias[2])
        else:
            self.Dense = nn.Sequential(
                nn.Linear(self.emb_size, dense_hidden, bias=True),
                nn.ReLU(),
                nn.Linear(dense_hidden, output_features, bias=bias[2]),
            )

    def forward(self, x):
        x = self.encoder(x)
        x = self.Dense(x)
        if not self.return_logits:
            if self.nb_classes <= 2:
                x = torch.sigmoid(x)
            else:
                x = F.softmax(x, dim=1)
        return x


def build_xeegnet():
    return XEEGNet(
        nb_classes=PARAMETERS_DEFAULT["nb_classes"],
        chans=PARAMETERS_DEFAULT["Chans"],
        samples=PARAMETERS_DEFAULT["sample_length"],
        sampling_frequency=PARAMETERS_DEFAULT["srate"],
        global_pooling=True,
    )


def reset_seed(seed: int | None) -> None:
    if seed is not None:
        torch.manual_seed(seed)


def powerset(bands: tuple[tuple[float, float], ...]):
    return tuple(chain.from_iterable(combinations(bands, length) for length in range(1, len(bands) + 1)))


def merge_band_edges(bands: tuple[tuple[float, float], ...]) -> list[float]:
    merged = sorted(edge for band in bands for edge in band)
    if len(merged) <= 2:
        return merged

    deduplicated = [merged[0]]
    for index in range(1, len(merged) - 2, 2):
        if merged[index] != merged[index + 1]:
            deduplicated.append(merged[index])
            deduplicated.append(merged[index + 1])
    deduplicated.append(merged[-1])
    return sorted(deduplicated)
