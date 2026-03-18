import json
from typing import Any, Dict, List, Optional
import hashlib

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from backend.database.models import Cluster, ClusterGroup, Dataset, DatasetArtifact, ShapleyValue
from backend.utils.dataset_storage import DatasetStorageManager
from backend.utils.logger import get_logger

logger = get_logger(__name__)


def _get_dataset_artifact(db: Session, dataset_id: str) -> Optional[DatasetArtifact]:
    return db.query(DatasetArtifact).filter(DatasetArtifact.dataset_id == dataset_id).first()


def _ensure_dataset_artifact(db: Session, dataset_id: str, data: List[Dict]) -> DatasetArtifact:
    artifact = _get_dataset_artifact(db, dataset_id)
    if artifact:
        return artifact

    path, schema, row_count, column_count = DatasetStorageManager.write_dataset(dataset_id, data)
    artifact = DatasetArtifact(
        dataset_id=dataset_id,
        path=path,
        format="parquet",
        schema=schema,
        row_count=row_count,
        column_count=column_count,
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


def create_dataset(db: Session, data: List[Dict], filename: Optional[str] = None) -> str:
    """
    Create a new dataset or return existing dataset ID.
    Handles JSON serialization issues by properly encoding numpy/pandas types.
    """
    try:
        # Convert any pandas/numpy types for proper serialization
        def json_serialize(obj):
            if isinstance(obj, (np.integer, np.int64)):
                return int(obj)
            elif isinstance(obj, (np.floating, np.float64)):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif pd and isinstance(obj, pd.DataFrame):
                return obj.to_dict(orient="records")
            elif pd and isinstance(obj, pd.Series):
                return obj.to_dict()
            elif isinstance(obj, (set, frozenset)):
                return list(obj)
            return obj

        # custom serialization
        data_str = json.dumps(data, default=json_serialize)
        file_id = hashlib.sha256(data_str.encode()).hexdigest()

        existing_dataset = db.query(Dataset).filter(Dataset.id == file_id).first()
        if not existing_dataset:
            logger.info(f"Creating new dataset with {len(data)} rows")
            db_dataset = Dataset(id=file_id, filename=filename)
            db.add(db_dataset)
            db.commit()
            db.refresh(db_dataset)
            existing_dataset = db_dataset
        else:
            logger.info(f"Dataset already exists with ID {file_id}")
            if filename and not existing_dataset.filename:
                existing_dataset.filename = filename
                db.commit()

        artifact = _ensure_dataset_artifact(db, file_id, data)
        if existing_dataset.storage_artifact is None:
            existing_dataset.storage_artifact = artifact
            db.commit()

        return file_id

    except Exception as e:
        logger.error(f"Error creating dataset: {str(e)}")
        raise RuntimeError(f"Failed to create dataset: {str(e)}")


def get_dataset(db: Session, dataset_id: str) -> Optional[Dataset]:
    return db.query(Dataset).filter(Dataset.id == dataset_id).first()


def get_dataset_data(db: Session, dataset_id: str) -> List[Dict]:
    dataset = get_dataset(db, dataset_id)
    if not dataset:
        return []

    artifact = dataset.storage_artifact or _get_dataset_artifact(db, dataset_id)
    if not artifact or not artifact.path:
        raise RuntimeError(f"No stored artifact found for dataset {dataset_id}")

    try:
        return DatasetStorageManager.load_dataset(artifact.path)
    except FileNotFoundError as exc:
        logger.error(f"Stored dataset file missing for {dataset_id}: {artifact.path}")
        raise RuntimeError(f"Dataset artifact missing for {dataset_id}") from exc


def get_all_datasets(db: Session) -> List[Dict[str, str]]:
    """
    Get all datasets with their IDs and filenames.

    Returns:
        List[Dict[str, str]]: List of dictionaries with 'id' and 'filename' keys
    """
    datasets = db.query(Dataset).all()
    result = []
    for dataset in datasets:
        artifact = dataset.storage_artifact
        row_count = artifact.row_count if artifact else 0
        column_count = artifact.column_count if artifact else 0
        storage_format = artifact.format if artifact else None

        result.append(
            {
                "id": dataset.id,
                "filename": dataset.filename,
                "row_count": row_count,
                "column_count": column_count,
                "storage_format": storage_format,
            }
        )
    return result


def delete_dataset(db: Session, dataset_id: str) -> bool:
    """
    Delete a dataset and all its related data (clusters, shapley values).

    Returns:
        bool: True if dataset was found and deleted, False otherwise
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        return False

    DatasetStorageManager.delete_dataset(dataset_id)
    db.delete(dataset)  # cascade will handle related records
    db.commit()

    return True


def reset_datasets(db: Session) -> None:
    """Reset the datasets table."""
    dataset_ids = [dataset_id for (dataset_id,) in db.query(Dataset.id).all()]
    for dataset_id in dataset_ids:
        DatasetStorageManager.delete_dataset(dataset_id)

    db.query(Dataset).delete()
    db.commit()


def save_clusters(
    db: Session, dataset_id: str, results: Dict[str, Dict[str, Dict[int, List[int]]]], algorithm: str
) -> None:
    """
    Save clusters to the database.
    """
    # Delete existing clusters for this dataset
    cluster_groups = db.query(ClusterGroup).filter(ClusterGroup.dataset_id == dataset_id).all()
    for group in cluster_groups:
        db.delete(group)
    db.commit()

    # Create new cluster groups and clusters
    for feat1, feature_pairs in results.items():
        for feat2, clusters in feature_pairs.items():
            cluster_group = ClusterGroup(dataset_id=dataset_id, feature1=feat1, feature2=feat2, algorithm=algorithm)
            db.add(cluster_group)
            db.flush()  # Generate ID without committing

            for cluster_id, indices in clusters.items():
                cluster = Cluster(cluster_group_id=cluster_group.id, cluster_id=cluster_id, data_point_indices=indices)
                db.add(cluster)

    db.commit()


def get_all_clusters(db: Session, dataset_id: str) -> Dict[str, Dict[str, Dict[int, List[int]]]]:
    """
    Get all clusters for a dataset.
    """
    result = {}

    cluster_groups = db.query(ClusterGroup).filter(ClusterGroup.dataset_id == dataset_id).all()

    for group in cluster_groups:
        if group.feature1 not in result:
            result[group.feature1] = {}

        feature_clusters = {}

        clusters = db.query(Cluster).filter(Cluster.cluster_group_id == group.id).all()

        for cluster in clusters:
            feature_clusters[cluster.cluster_id] = cluster.data_point_indices

        result[group.feature1][group.feature2] = feature_clusters

    return result


def get_clusters_by_features(
    db: Session, dataset_id: str, feature1: str, feature2: str
) -> Optional[Dict[int, List[int]]]:
    """
    Get clusters for a specific feature pair.
    """
    cluster_group = (
        db.query(ClusterGroup)
        .filter(
            ClusterGroup.dataset_id == dataset_id, ClusterGroup.feature1 == feature1, ClusterGroup.feature2 == feature2
        )
        .first()
    )

    if not cluster_group:
        # Try reverse order
        cluster_group = (
            db.query(ClusterGroup)
            .filter(
                ClusterGroup.dataset_id == dataset_id,
                ClusterGroup.feature1 == feature2,
                ClusterGroup.feature2 == feature1,
            )
            .first()
        )

    if not cluster_group:
        return None

    clusters = db.query(Cluster).filter(Cluster.cluster_group_id == cluster_group.id).all()

    result = {}
    for cluster in clusters:
        result[cluster.cluster_id] = cluster.data_point_indices

    return result


def save_shapley_values(db: Session, dataset_id: str, target_column: str, shapley_values: List[Dict[str, Any]]) -> None:
    """
    Save SHAPley values to the database.
    """
    # Delete existing Shapley values for this dataset and target column
    db.query(ShapleyValue).filter(
        ShapleyValue.dataset_id == dataset_id, ShapleyValue.target_column == target_column
    ).delete()

    # Create new Shapley values
    for item in shapley_values:
        value = ShapleyValue(
            dataset_id=dataset_id, target_column=target_column, feature=item["feature"], value=item["SHAP Value"]
        )
        db.add(value)

    db.commit()


def get_shapley_values(db: Session, dataset_id: str, target_column: str) -> List[Dict[str, Any]]:
    """
    Get SHAPley values for a dataset and target column.
    """
    values = (
        db.query(ShapleyValue)
        .filter(ShapleyValue.dataset_id == dataset_id, ShapleyValue.target_column == target_column)
        .all()
    )

    return [{"feature": val.feature, "SHAP Value": val.value} for val in values]
