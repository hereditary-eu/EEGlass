"""
Spectral-connectivity (SCC) precompute-and-cache.

Design principle: cache RAW per-pair coherence, reduce LATE.
We store `(n_windows, n_bands, n_pairs)` per subject — the upper triangle of each
band's C×C coherence matrix (171 pairs for 19 channels). Every downstream option
(mean / learned-edge / learned-node) is then a cheap transform at consume time,
with zero MNE recompute. Bands are fixed and no waveform manipulation happens,
so the only cache-invalidation axis is the transform params (-> scc_key).

Layout (sibling to the prediction cache, NOT under any model/checkpoint, because
SCC does not depend on model weights):

    data/scc_cache/<dataset_id>/<scc_key>/subjects/<subject_id>.<source>.scc.npy
    data/scc_cache/<dataset_id>/<scc_key>/subjects/<subject_id>.<source>.scc.json  (sidecar)

Portability: the store/compute pieces are pure and dependency-injected. The
notebook triggers compute lazily on a miss; EEGlas can run precompute_dataset()
as a background job over the same store — same code path, same files.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import numpy as np

try:
    from tqdm.auto import tqdm  # notebook-aware progress bar
except ImportError:  # tqdm optional -> fall back to a no-op wrapper

    def tqdm(iterable=None, **_kwargs):
        return iterable if iterable is not None else iter(())


# Bump if the on-disk schema changes (mirrors EEGlas PREPROCESSING_VERSION).
SCC_CACHE_VERSION = 1

# Fixed bands (must match the notebook / model bands exactly).
DEFAULT_BANDS: tuple[tuple[str, float, float], ...] = (
    ("delta", 0.5, 4.0),
    ("theta", 4.0, 8.0),
    ("alpha", 8.0, 13.0),
    ("beta1", 13.0, 17.0),
    ("beta2", 17.0, 21.0),
    ("beta3", 21.0, 25.0),
    ("gamma", 25.0, 45.0),
)


# ---------------------------------------------------------------------------
# Params  — the single cache-invalidation axis
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class SCCParams:
    """Everything SCC deterministically depends on. Hashes to the scc_key."""

    sfreq: float
    sample_length: int
    bands: tuple[tuple[str, float, float], ...] = DEFAULT_BANDS
    freqs: tuple[float, ...] = tuple(np.arange(1.0, 45.5, 1.0))
    n_cycles: tuple[float, ...] = tuple(np.arange(1.0, 45.5, 1.0) / 2.0)
    method: str = "coh"
    mode: str = "cwt_morlet"

    @classmethod
    def default(cls, sfreq: float, sample_length: int) -> "SCCParams":
        return cls(sfreq=float(sfreq), sample_length=int(sample_length))

    @property
    def band_names(self) -> list[str]:
        return [name for name, _, _ in self.bands]

    @property
    def fmin(self) -> tuple[float, ...]:
        return tuple(lo for _, lo, _ in self.bands)

    @property
    def fmax(self) -> tuple[float, ...]:
        return tuple(hi for _, _, hi in self.bands)

    @property
    def n_bands(self) -> int:
        return len(self.bands)

    def key(self) -> str:
        """`scc-` + first 16 hex of a sha256 over the params (mirrors checkpoint-key)."""
        payload = json.dumps(
            {
                "v": SCC_CACHE_VERSION,
                "sfreq": self.sfreq,
                "sample_length": self.sample_length,
                "bands": self.bands,
                "freqs": self.freqs,
                "n_cycles": self.n_cycles,
                "method": self.method,
                "mode": self.mode,
            },
            sort_keys=True,
        ).encode()
        return "scc-" + hashlib.sha256(payload).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Pair-index helpers  (fixed upper-triangle convention, k=1, no diagonal)
# ---------------------------------------------------------------------------
def pair_indices(n_channels: int) -> tuple[np.ndarray, np.ndarray]:
    return np.triu_indices(n_channels, k=1)


def pairs_to_dense(pairs: np.ndarray, n_channels: int, fill_diagonal: float = 0.0) -> np.ndarray:
    """Rebuild symmetric (..., C, C) from flattened upper triangle (..., n_pairs)."""
    rows, cols = pair_indices(n_channels)
    out = np.zeros((*pairs.shape[:-1], n_channels, n_channels), dtype=pairs.dtype)
    out[..., rows, cols] = pairs
    out[..., cols, rows] = pairs
    if fill_diagonal:
        idx = np.arange(n_channels)
        out[..., idx, idx] = fill_diagonal
    return out


# ---------------------------------------------------------------------------
# Compute  — pure function, MNE inside, one batched call per subject
# ---------------------------------------------------------------------------
def compute_scc_windows(
    windows: np.ndarray,
    params: SCCParams,
    n_channels: int,
    n_jobs: int = 1,
    chunk_size: int | None = None,
    progress: bool = False,
) -> np.ndarray:
    """
    windows: (n_windows, n_channels, sample_length)  — the SAME array used as x.
    returns: (n_windows, n_bands, n_pairs) float32.

    Coherence is invariant to per-channel scaling, so the µV factor in the
    windowing pipeline does not affect these values. By default all windows go in
    one spectral_connectivity_time call (first axis == epochs).

    Each window is an independent epoch, so passing `chunk_size` splits the call
    into batches of that many windows and concatenates — numerically identical
    (proven to 7e-9), but it gives a per-window progress bar for long subjects.
    Set `progress=True` to show it. Chunking does NOT speed things up (~1.0x);
    it only buys granularity.
    """
    from mne_connectivity import spectral_connectivity_time  # local import: keep module light

    rows, cols = pair_indices(n_channels)
    windows = np.asarray(windows, dtype=np.float64)
    n_windows = len(windows)

    def _compute_batch(batch: np.ndarray) -> np.ndarray:
        con = spectral_connectivity_time(
            batch,
            freqs=np.asarray(params.freqs),
            method=params.method,
            mode=params.mode,
            n_cycles=np.asarray(params.n_cycles),
            fmin=params.fmin,
            fmax=params.fmax,
            faverage=True,  # average within each band -> one value per band
            average=False,  # keep per-window
            indices=(rows, cols),
            sfreq=params.sfreq,
            n_jobs=n_jobs,
            verbose="ERROR",
        )
        data = np.asarray(con.get_data())  # (batch, n_pairs, n_bands)
        if data.ndim != 3:
            raise RuntimeError(f"Unexpected connectivity shape {data.shape}; expected 3D.")
        return np.transpose(data, (0, 2, 1))  # -> (batch, n_bands, n_pairs)

    if not chunk_size or chunk_size >= n_windows:
        data = _compute_batch(windows)
    else:
        starts = range(0, n_windows, chunk_size)
        n_chunks = (n_windows + chunk_size - 1) // chunk_size
        bar = tqdm(starts, total=n_chunks, desc="SCC windows", unit="chunk", disable=not progress)
        data = np.concatenate([_compute_batch(windows[s0 : s0 + chunk_size]) for s0 in bar], axis=0)

    return np.ascontiguousarray(data, dtype=np.float32)


# ---------------------------------------------------------------------------
# Store  — swappable backend behind get / put / get_or_compute
# ---------------------------------------------------------------------------
class SCCStore:
    def __init__(self, root: Path | str = Path("data") / "scc_cache"):
        self.root = Path(root)

    def _subjects_dir(self, dataset_id: str, scc_key: str) -> Path:
        return self.root / dataset_id / scc_key / "subjects"

    def _npy_path(self, dataset_id: str, subject_id: str, source: str, scc_key: str) -> Path:
        return self._subjects_dir(dataset_id, scc_key) / f"{subject_id}.{source}.scc.npy"

    def _json_path(self, dataset_id: str, subject_id: str, source: str, scc_key: str) -> Path:
        return self._subjects_dir(dataset_id, scc_key) / f"{subject_id}.{source}.scc.json"

    def _is_valid(self, meta: dict, dataset_id: str, subject_id: str, source: str, params: SCCParams) -> bool:
        return (
            isinstance(meta, dict)
            and meta.get("scc_cache_version") == SCC_CACHE_VERSION
            and meta.get("dataset_id") == dataset_id
            and meta.get("subject_id") == subject_id
            and meta.get("source") == source
            and meta.get("scc_key") == params.key()
        )

    def get(self, dataset_id: str, subject_id: str, source: str, params: SCCParams) -> np.ndarray | None:
        npy = self._npy_path(dataset_id, subject_id, source, params.key())
        js = self._json_path(dataset_id, subject_id, source, params.key())
        if not (npy.is_file() and js.is_file()):
            return None
        try:
            meta = json.loads(js.read_text())
        except OSError, json.JSONDecodeError:
            return None
        if not self._is_valid(meta, dataset_id, subject_id, source, params):
            return None
        return np.load(npy)

    def put(
        self,
        dataset_id: str,
        subject_id: str,
        source: str,
        array: np.ndarray,
        params: SCCParams,
        n_channels: int,
        verbose: bool = True,
    ) -> None:
        scc_key = params.key()
        subjects_dir = self._subjects_dir(dataset_id, scc_key)
        subjects_dir.mkdir(parents=True, exist_ok=True)

        npy = self._npy_path(dataset_id, subject_id, source, scc_key)
        js = self._json_path(dataset_id, subject_id, source, scc_key)

        if verbose:
            print(f"  saving SCC {tuple(array.shape)} -> {npy}")

        # atomic-ish writes: temp then replace (matches EEGlas write pattern).
        tmp_npy = npy.with_suffix(".npy.tmp")
        with open(tmp_npy, "wb") as fh:  # save via handle so np.save doesn't append .npy
            np.save(fh, array)
        tmp_npy.replace(npy)

        meta = {
            "scc_cache_version": SCC_CACHE_VERSION,
            "dataset_id": dataset_id,
            "subject_id": subject_id,
            "source": source,
            "scc_key": scc_key,
            "n_windows": int(array.shape[0]),
            "n_bands": int(array.shape[1]),
            "n_pairs": int(array.shape[2]),
            "n_channels": int(n_channels),
            "band_names": params.band_names,
            "band_edges": [[lo, hi] for _, lo, hi in params.bands],
            "pair_convention": f"np.triu_indices({n_channels}, k=1)",
            "sfreq": params.sfreq,
            "sample_length": params.sample_length,
            "method": params.method,
            "mode": params.mode,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        tmp_js = js.with_suffix(".json.tmp")
        tmp_js.write_text(json.dumps(meta, indent=2))
        tmp_js.replace(js)

    def get_or_compute(
        self,
        dataset_id: str,
        subject_id: str,
        source: str,
        params: SCCParams,
        n_channels: int,
        windows_or_fn: np.ndarray | Callable[[], np.ndarray],
        n_jobs: int = 1,
        verbose: bool = True,
        chunk_size: int | None = None,
        progress: bool = False,
    ) -> np.ndarray:
        cached = self.get(dataset_id, subject_id, source, params)
        if cached is not None:
            if verbose:
                print(f"  cache hit for {subject_id} ({source}) -> {tuple(cached.shape)}")
            return cached
        if verbose:
            print(f"  cache miss for {subject_id} ({source}) -> computing SCC...")
        windows = windows_or_fn() if callable(windows_or_fn) else windows_or_fn
        array = compute_scc_windows(
            windows, params, n_channels, n_jobs=n_jobs, chunk_size=chunk_size, progress=progress
        )
        self.put(dataset_id, subject_id, source, array, params, n_channels, verbose=verbose)
        return array


# ---------------------------------------------------------------------------
# Dataset-level precompute  (EEGlas job entry point)
# ---------------------------------------------------------------------------
def precompute_dataset(
    store: SCCStore,
    dataset_id: str,
    subjects: list[tuple[str, np.ndarray]],
    params: SCCParams,
    n_channels: int,
    source: str = "derivatives",
    n_jobs: int = -1,
    verbose: bool = True,
    chunk_size: int | None = None,
    progress: bool = False,
) -> None:
    """subjects: list of (subject_id, windows). Fills the disk cache once; skips hits."""
    print(f"Precomputing SCC for {len(subjects)} subjects | key={params.key()} | source={source}")
    print(f"  -> {store._subjects_dir(dataset_id, params.key())}")
    n_hits = 0
    bar = tqdm(subjects, desc="SCC precompute", unit="subj", disable=not verbose)
    for subject_id, windows in bar:
        already = store.get(dataset_id, subject_id, source, params) is not None
        n_hits += already
        if hasattr(bar, "set_postfix_str"):
            bar.set_postfix_str(subject_id)
        # per-subject prints go quiet during the bar; the bar carries progress.
        store.get_or_compute(
            dataset_id,
            subject_id,
            source,
            params,
            n_channels,
            windows,
            n_jobs=n_jobs,
            verbose=verbose,
            chunk_size=chunk_size,
            progress=progress,
        )
    print(f"Done: {len(subjects) - n_hits} computed, {n_hits} already cached.")


# ---------------------------------------------------------------------------
# Training-array builder  — mirrors load_multiple_eeg_windows_inner, adds SCC.
# SCC is computed from the SAME windows that become x -> alignment guaranteed.
# ---------------------------------------------------------------------------
def build_x_y_scc(
    dir_data: str,
    participant_ids: list[int],
    label_of_subject: dict[str, int],
    store: SCCStore,
    params: SCCParams,
    load_model_windows_for_participant: Callable,
    *,
    dataset_id: str,
    n_channels: int,
    source: str = "derivatives",
    sample_length: int | None = None,
    n_jobs: int = 1,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Returns (x, y, scc, subject_ids), all concatenated in participant order.
      x:   (N, C, L)  float32
      scc: (N, n_bands, n_pairs) float32   — raw pairs, reduce in the model
      y, subject_ids: (N,) int64
    """
    xs, ys, sccs, sids = [], [], [], []
    for pid in participant_ids:
        subject_id = f"sub-{pid:03d}"
        windows, _sfreq, _ranges = load_model_windows_for_participant(dir_data, pid, sample_length=sample_length)
        windows = np.asarray(windows, dtype=np.float32)
        scc = store.get_or_compute(dataset_id, subject_id, source, params, n_channels, windows, n_jobs=n_jobs)
        if subject_id not in label_of_subject:
            raise ValueError(f"Missing label for {subject_id}")
        xs.append(windows)
        sccs.append(scc)
        ys.append(np.full(len(windows), int(label_of_subject[subject_id]), dtype=np.int64))
        sids.append(np.full(len(windows), int(pid), dtype=np.int64))

    x = np.concatenate(xs, axis=0).astype("float32", copy=False)
    scc = np.concatenate(sccs, axis=0).astype("float32", copy=False)
    y = np.concatenate(ys, axis=0)
    subject_ids = np.concatenate(sids, axis=0)
    print(f"Loaded x {x.shape}, scc {scc.shape}, y {y.shape}")
    return x, y, scc, subject_ids


# ---------------------------------------------------------------------------
# Torch consumer side  (import guarded so the cache is usable without torch)
# ---------------------------------------------------------------------------
try:
    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset

    class CachedSCCDataset(Dataset):
        """Yields ([x_i, scc_i], y_i). Default collate -> ([X, SCC], Y), which
        train_model's non-tensor-X branch already handles (loops X[i].to(device))."""

        def __init__(self, x: np.ndarray, scc: np.ndarray, y: np.ndarray):
            assert len(x) == len(scc) == len(y)
            self.x = torch.as_tensor(x, dtype=torch.float32)
            self.scc = torch.as_tensor(scc, dtype=torch.float32)
            self.y = torch.as_tensor(y, dtype=torch.long)

        def __len__(self) -> int:
            return len(self.y)

        def __getitem__(self, i):
            return [self.x[i], self.scc[i]], self.y[i]

    class SCCReducer(nn.Module):
        """Reduce raw pairs (B, bands, n_pairs) -> (B, bands). The one thing that
        changes between Option A / edge / node; cache and dataset never change."""

        def __init__(self, n_bands: int, n_pairs: int, n_channels: int, mode: str = "mean"):
            super().__init__()
            self.mode = mode
            self.n_channels = n_channels
            if mode == "edge":  # learned weight per edge, per band
                self.w = nn.Parameter(torch.randn(n_bands, n_pairs) * 0.01)
                self.b = nn.Parameter(torch.zeros(n_bands))
            elif mode == "node":  # learned 19-vector/band == a topomap
                self.w = nn.Parameter(torch.randn(n_bands, n_channels) * 0.01)
                r, c = pair_indices(n_channels)
                self.register_buffer("rows", torch.as_tensor(r, dtype=torch.long))
                self.register_buffer("cols", torch.as_tensor(c, dtype=torch.long))
            elif mode != "mean":
                raise ValueError(mode)

        def forward(self, pairs: torch.Tensor) -> torch.Tensor:
            if self.mode == "mean":
                return pairs.mean(-1)
            if self.mode == "edge":
                return torch.einsum("bfe,fe->bf", pairs, self.w) + self.b
            # node: rebuild symmetric dense, then bilinear w^T M w
            B, Fb, _ = pairs.shape
            C = self.n_channels
            M = pairs.new_zeros(B, Fb, C, C)
            M[:, :, self.rows, self.cols] = pairs
            M[:, :, self.cols, self.rows] = pairs
            return torch.einsum("bfij,fi,fj->bf", M, self.w, self.w)

except ImportError:  # torch not present -> cache/compute still importable
    pass
