from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from backend.ml.scc_cache import DEFAULT_BANDS as SCC_DEFAULT_BANDS, SCCReducer

BANDS = {name: (lo, hi) for name, lo, hi in SCC_DEFAULT_BANDS}

# class EEGWithSCC(Dataset):
#     def __getitem__(self, i):
#         x   = self.windows[i]            # (C, T) tensor
#         scc = self.scc_cache[i]          # (n_bands,) precomputed once, loaded from .npy
#         return [x, scc], self.labels[i]  # list -> train_model's non-tensor branch handles it

class xEEGNetSCC(nn.Module):
    """Wrapper for `selfeeg.models.xEEGNet` that consumes cached SCC pairs.

    Usage:
        base = selfeeg.models.xEEGNet(..., global_pooling=True)
        wrapped = xEEGNetSCC(base_model=base)

    The forward contract is now `forward([x, scc_pairs])` where:
        x         -> (B, C, T) raw EEG windows
        scc_pairs -> (B, n_bands, n_pairs) cached SCC pair vectors
    """

    def __init__(self, base_model: nn.Module, reducer_mode: str = "mean", freeze_base: bool = False):
        super().__init__()
        self.base = base_model

        # base must have emb_size attribute computed at init (xEEGNet does)
        emb_size = getattr(self.base, "emb_size", None)
        if emb_size is None:
            raise ValueError("base_model must expose `emb_size` attribute (xEEGNet does).")

        self.n_bands = len(BANDS)
        self.n_channels = self._infer_n_channels(base_model)
        if self.n_channels is None:
            raise ValueError("base_model must expose the number of channels so SCCReducer can be built.")

        self.n_pairs = self.n_channels * (self.n_channels - 1) // 2
        self.reducer = SCCReducer(
            n_bands=self.n_bands,
            n_pairs=self.n_pairs,
            n_channels=self.n_channels,
            mode=reducer_mode,
        )

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
            bias = getattr(self.base.Dense, "bias", None) is not None
            self.Dense = nn.Linear(new_in, nb_out, bias=bias)

        # optionally freeze base encoder
        if freeze_base:
            for p in self.base.parameters():
                p.requires_grad = False

    @staticmethod
    def _infer_n_channels(base_model: nn.Module) -> Optional[int]:
        for candidate in (base_model, getattr(base_model, "encoder", None)):
            if candidate is None:
                continue
            for attr in ("Chans", "chans", "n_channels", "num_channels"):
                value = getattr(candidate, attr, None)
                if value is not None:
                    return int(value)
        return None

    def forward(self, X) -> torch.Tensor:
        if not isinstance(X, (list, tuple)) or len(X) != 2:
            raise TypeError("xEEGNetSCC now expects input as [x, scc_pairs].")

        x, scc_pairs = X

        # encoder output (B, emb_size)
        emb = self.base.encoder(x)
        conn = self.reducer(scc_pairs)  # (B, n_bands)
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

