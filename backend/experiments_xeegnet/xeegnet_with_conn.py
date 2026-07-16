from typing import Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from mne_connectivity import spectral_connectivity_time


# Default bands used in your notebook
BANDS = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta1": (13.0, 17.0),
    "beta2": (17.0, 21.0),
    "beta3": (21.0, 25.0),
    "gamma": (25.0, 45.0),
}

class SpectralConnectivity(nn.Module):
    """Compute mean spectral connectivity per frequency band with MNE.

    The module uses `mne_connectivity.spectral_connectivity_time` on a single
    epoch at a time and returns one scalar per band. The scalar is the mean
    coherence across all unique off-diagonal channel pairs in that band.

    Input: `x` shaped (B, C, T)
    Output: tensor shaped (B, n_bands)
    """

    def __init__(
        self,
        bands: Dict[str, Tuple[float, float]] = BANDS,
        Fs: int = 125,
        freqs: Optional[np.ndarray] = None,
        n_cycles: Optional[np.ndarray] = None,
        mode: str = "cwt_morlet",
        method: str = "coh",
        faverage: bool = True,
        average: bool = False,
        verbose: str | bool | int | None = "ERROR",
        n_fft: Optional[int] = None,
        hop_length: Optional[int] = None,
        window: Optional[torch.Tensor] = None,
        **kwargs,
    ):
        super().__init__()
        self.bands = list(bands.items())
        self.band_names = [k for k, _ in self.bands]
        self.n_bands = len(self.bands)
        self.Fs = Fs
        self.freqs = np.asarray(freqs if freqs is not None else np.arange(1.0, 45.5, 1.0), dtype=float)
        self.n_cycles = np.asarray(n_cycles if n_cycles is not None else self.freqs / 2.0, dtype=float)
        self.mode = mode
        self.method = method
        self.faverage = faverage
        self.average = average
        self.verbose = verbose
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.window = window

        # one row/col index per unique channel pair, excluding the diagonal
        self._pair_cache: dict[int, tuple[np.ndarray, np.ndarray]] = {}

    def _pair_indices(self, n_channels: int) -> tuple[np.ndarray, np.ndarray]:
        if n_channels not in self._pair_cache:
            self._pair_cache[n_channels] = np.triu_indices(n_channels, k=1)
        return self._pair_cache[n_channels]

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, C, T)
        B, C, T = x.shape
        device = x.device

        rows, cols = self._pair_indices(C)

        band_features = []
        for batch_index in range(B):
            sample = x[batch_index].detach().to("cpu", dtype=torch.float32).numpy()
            sample = sample[np.newaxis, ...]  # (1, C, T)

            con = spectral_connectivity_time(
                sample,
                freqs=self.freqs,
                method=self.method,
                average=self.average,
                indices=(rows, cols),
                sfreq=self.Fs,
                fmin=tuple(lo for _, (lo, _) in self.bands),
                fmax=tuple(hi for _, (_, hi) in self.bands),
                faverage=self.faverage,
                mode=self.mode,
                n_cycles=self.n_cycles,
                verbose=self.verbose,
            )

            data = con.get_data()
            # expected shape for a single epoch: (1, n_pairs, n_bands)
            if data.ndim == 3:
                data = data[0]
            elif data.ndim == 2:
                # if average=True or a different backend shape appears
                pass
            else:
                raise RuntimeError(f"Unexpected connectivity shape: {data.shape}")

            # mean across unique pairs -> one scalar per band
            band_features.append(torch.as_tensor(data.mean(axis=0), dtype=torch.float32, device=device))

        return torch.stack(band_features, dim=0)


class xEEGNetSCC(nn.Module):
    """Wrapper for `selfeeg.models.xEEGNet` that appends per-band spectral
    connectivity features to the encoder embedding before the final Dense.

    Usage:
        base = selfeeg.models.xEEGNet(..., global_pooling=True)
        wrapped = xEEGNetSCC(base_model=base, spec_kwargs={...})
    """

    def __init__(self, base_model: nn.Module, spec_kwargs: Optional[dict] = None, freeze_base: bool = False):
        super().__init__()
        self.base = base_model
        spec_kwargs = spec_kwargs or {}
        # infer Fs from base encoder if present, otherwise require in spec_kwargs
        Fs = getattr(getattr(self.base, "encoder", None), "Fs", spec_kwargs.get("Fs", 125))
        spec_kwargs.setdefault("Fs", Fs)
        self.spec = SpectralConnectivity(**spec_kwargs)

        # base must have emb_size attribute computed at init (xEEGNet does)
        emb_size = getattr(self.base, "emb_size", None)
        if emb_size is None:
            raise ValueError("base_model must expose `emb_size` attribute (xEEGNet does).")

        self.n_bands = self.spec.n_bands

        # create new Dense head that accepts concatenated features
        nb_out = 1 if self.base.nb_classes <= 2 else self.base.nb_classes
        # replace Dense with expanded input
        new_in = emb_size + self.n_bands
        # mirror whether base used Sequential Dense or Linear
        if isinstance(self.base.Dense, nn.Sequential):
            # keep a simple head: Linear(new_in, hidden) -> ReLU -> Linear(hidden, out)
            hidden = 64
            self.Dense = nn.Sequential(nn.Linear(new_in, hidden), nn.ReLU(), nn.Linear(hidden, nb_out))
        else:
            self.Dense = nn.Linear(new_in, nb_out, bias=getattr(self.base.Dense, "bias", True))

        # optionally freeze base encoder
        if freeze_base:
            for p in self.base.parameters():
                p.requires_grad = False

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # encoder output (B, emb_size)
        emb = self.base.encoder(x)
        conn = self.spec(x)  # (B, n_bands)
        out = torch.cat([emb, conn], dim=1)
        out = self.Dense(out)
        if not (self.base.return_logits):
            if self.base.nb_classes <= 2:
                out = torch.sigmoid(out)
            else:
                out = F.softmax(out, dim=1)
        return out


class xEEGNetWithConnectivity(xEEGNetSCC):
    """Alias with a more descriptive name."""

