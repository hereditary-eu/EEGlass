from __future__ import annotations

import numpy as np


def reduce_embeddings_pca(vectors: np.ndarray) -> tuple[np.ndarray, list[float], str]:
    if vectors.ndim != 2 or vectors.shape[0] < 2:
        return np.empty((0, 2), dtype=float), [], "insufficient_data"

    vectors = vectors.astype(float, copy=False)
    source_dimension = vectors.shape[1]
    centered = vectors - np.mean(vectors, axis=0, keepdims=True)

    if source_dimension == 1:
        coordinates = np.column_stack([centered[:, 0], np.zeros(centered.shape[0], dtype=float)])
        variance = float(np.var(centered[:, 0], ddof=1)) if centered.shape[0] > 1 else 0.0
        ratio = [1.0 if variance > 0 else 0.0, 0.0]
        return coordinates, ratio, "ok"

    _u, singular_values, components = np.linalg.svd(centered, full_matrices=False)
    output_components = components[:2]
    coordinates = centered @ output_components.T
    if coordinates.shape[1] == 1:
        coordinates = np.column_stack([coordinates[:, 0], np.zeros(coordinates.shape[0], dtype=float)])

    variances = (singular_values**2) / max(vectors.shape[0] - 1, 1)
    total_variance = float(np.sum(variances))
    if total_variance > 0:
        explained = (variances[:2] / total_variance).astype(float).tolist()
    else:
        explained = []
    explained = (explained + [0.0, 0.0])[:2]
    return coordinates[:, :2].astype(float, copy=False), explained, "ok"


def cluster_embeddings_density(vectors: np.ndarray) -> list[int | None]:
    return cluster_embeddings_dbscan(vectors)


def cluster_embeddings_dbscan(
    vectors: np.ndarray,
    *,
    min_samples: int | None = None,
    eps: float | None = None,
) -> list[int | None]:
    if vectors.ndim != 2 or vectors.shape[0] == 0:
        return []

    vectors = vectors.astype(float, copy=False)
    point_count = vectors.shape[0]
    resolved_min_samples = min_samples if min_samples is not None else min(8, max(3, int(np.sqrt(point_count))))
    resolved_min_samples = min(max(2, resolved_min_samples), point_count)
    distances = np.linalg.norm(vectors[:, np.newaxis, :] - vectors[np.newaxis, :, :], axis=2)
    resolved_eps = eps if eps is not None else estimate_dbscan_eps(distances, resolved_min_samples)
    if not np.isfinite(resolved_eps) or resolved_eps <= 0:
        return [None] * point_count

    labels = np.full(point_count, -1, dtype=int)
    visited = np.zeros(point_count, dtype=bool)
    cluster_id = 0

    for point_index in range(point_count):
        if visited[point_index]:
            continue

        visited[point_index] = True
        neighbors = region_query(distances, point_index, resolved_eps)
        if len(neighbors) < resolved_min_samples:
            continue

        labels[point_index] = cluster_id
        seeds = list(neighbors)
        seed_offset = 0
        while seed_offset < len(seeds):
            neighbor_index = seeds[seed_offset]
            if not visited[neighbor_index]:
                visited[neighbor_index] = True
                neighbor_neighbors = region_query(distances, neighbor_index, resolved_eps)
                if len(neighbor_neighbors) >= resolved_min_samples:
                    for next_neighbor in neighbor_neighbors:
                        if next_neighbor not in seeds:
                            seeds.append(next_neighbor)

            if labels[neighbor_index] == -1:
                labels[neighbor_index] = cluster_id
            seed_offset += 1

        cluster_id += 1

    return [int(label) if label >= 0 else None for label in labels]


def estimate_dbscan_eps(distances: np.ndarray, min_samples: int) -> float:
    if distances.shape[0] < 2:
        return 0.0

    sorted_distances = np.sort(distances, axis=1)
    neighbor_column = min(min_samples - 1, sorted_distances.shape[1] - 1)
    neighbor_distances = sorted_distances[:, neighbor_column]
    positive_distances = neighbor_distances[neighbor_distances > 0]
    if not positive_distances.size:
        return 0.0

    return float(np.percentile(positive_distances, 75))


def region_query(distances: np.ndarray, point_index: int, eps: float) -> list[int]:
    return np.flatnonzero(distances[point_index] <= eps).astype(int).tolist()
