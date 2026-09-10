from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from backend.ml.scc_cache import (
    DEFAULT_BANDS as SCC_DEFAULT_BANDS,
)
from backend.ml.scc_cache import (
    SCCReducer,
    calc_mean_scc_per_channel,
)

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

    def __init__(self, base_model: nn.Module, reducer_mode_scc: str = "mean", freeze_base: bool = False):
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
            mode=reducer_mode_scc,
        )

        self.scc_norm = nn.BatchNorm1d(self.n_bands)  # 7 features in, 7 out

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

    @torch.no_grad()
    def visualization_maps(self, scc_pairs: torch.Tensor):
        """
        scc_pairs = X[1], second part of input list
        SCC-branch visualisation, 3-class only. Returns per-channel maps plus
        the SCC branch's band activation and its per-class contributions.
        """
        self.eval()
        scc_mean_per_channel = calc_mean_scc_per_channel(scc_pairs.detach().cpu().numpy(), n_channels=self.n_channels)

        node_contribution = (
            self.reducer._node_contrib(scc_pairs).cpu().numpy() if self.reducer.mode == "node" else None
        )  # (B,7,C) or None

        # Node weights are (bands, channels); edge weights have a different meaning.
        node_spatial_model_weights = self.reducer.w.detach().cpu().numpy() if self.reducer.mode == "node" else None

        # --- Band Activations (SCC branch): the 7-dim input to the head ---
        conn = self.reducer(scc_pairs)  # (B, 7)  raw reduced SCC
        dense_input_scc = self.scc_norm(conn)  # (B, 7)  normalised — what the head actually sees

        # --- Class contributions (SCC branch), 3-class only ---
        class_contrib_scc = None
        if self.base.nb_classes == 3 and isinstance(self.Dense, nn.Linear):
            W = self.Dense.weight  # (3, 14) = (nb_out, emb+7)
            W_scc = W[:, -self.n_bands :]  # (3, 7) — SCC columns (last 7)
            # per-class, per-band contribution = input_band * weight[class, band]
            class_contrib_scc = (
                (
                    dense_input_scc.unsqueeze(1) * W_scc.unsqueeze(0)  # (B,3,7)
                )
                .cpu()
                .numpy()
            )

        return {
            "scc_mean_per_channel": np.asarray(
                scc_mean_per_channel
            ),  # (B,7,C)            -> total bandpower plot scc version, optional!
            "spatial_node_weights": node_spatial_model_weights,  # (7,C), node reducer only
            "node_contribution": node_contribution,  # (B,7,C) or None    -> for topomap
            "band_activation_scc": dense_input_scc.cpu().numpy(),  # (B,7)              -> for band activation plot
            "class_contribution_scc": class_contrib_scc,  # (B,3,7) or None    -> for class contribution plot (or weighted band activation)
        }

    def forward(self, X) -> torch.Tensor:
        if not isinstance(X, (list, tuple)) or len(X) != 2:
            raise TypeError("xEEGNetSCC now expects input as [x, scc_pairs].")
        x, scc_pairs = X

        # encoder output (B, emb_size)
        emb = self.base.encoder(x)  # (B, emb_size=n_bands=7?)
        conn = self.reducer(scc_pairs)  # (B, n_bands)?

        # conn_normalized = F.normalize(conn, p=2, dim=1)  # L2 normalize across bands
        conn_normalized = self.scc_norm(conn)
        out = torch.cat([emb, conn_normalized], dim=1)
        out = self.Dense(out)
        if not (self.base.return_logits):
            if self.base.nb_classes <= 2:
                out = torch.sigmoid(out)
            else:
                out = F.softmax(out, dim=1)
        return out
