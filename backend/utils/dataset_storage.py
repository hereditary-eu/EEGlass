from __future__ import annotations

import shutil
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd

from backend.config import CONFIG
from backend.utils.logger import get_logger

logger = get_logger(__name__)


class DatasetStorageManager:
    """Manages persistence of sanitized datasets on disk."""

    _storage_dir = Path(CONFIG.DATASET_STORAGE_DIR)

    @classmethod
    def _ensure_storage_dir(cls) -> None:
        cls._storage_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def _dataset_dir(cls, dataset_id: str) -> Path:
        return cls._storage_dir / dataset_id

    @classmethod
    def write_dataset(cls, dataset_id: str, data: List[Dict[str, Any]]) -> Tuple[str, List[Dict[str, Any]], int, int]:
        """
        Persist sanitized dataset to Parquet and return metadata.
        Returns:
            path (str): Absolute path to the stored file.
            schema (List[Dict]): Column schema metadata.
            row_count (int)
            column_count (int)
        """
        cls._ensure_storage_dir()
        dataset_dir = cls._dataset_dir(dataset_id)
        dataset_dir.mkdir(parents=True, exist_ok=True)

        df = pd.DataFrame(data)
        row_count = len(df.index)
        column_count = len(df.columns)

        schema = []
        if column_count > 0:
            for column in df.columns:
                dtype = str(df[column].dtype)
                if pd.api.types.is_numeric_dtype(df[column]):
                    logical_type = "numeric"
                elif pd.api.types.is_bool_dtype(df[column]):
                    logical_type = "boolean"
                elif pd.api.types.is_datetime64_any_dtype(df[column]):
                    logical_type = "datetime"
                else:
                    logical_type = "string"
                schema.append({"name": column, "dtype": dtype, "logical_type": logical_type})

        file_path = dataset_dir / "dataset.parquet"
        df.to_parquet(file_path, index=False)
        logger.info(f"Stored dataset {dataset_id} to {file_path}")

        return str(file_path.resolve()), schema, row_count, column_count

    @classmethod
    def load_dataset(cls, path: str) -> List[Dict[str, Any]]:
        """
        Load a stored dataset from Parquet.
        """
        df = pd.read_parquet(path)
        # Ensure JSON-serializable payload
        return json.loads(df.to_json(orient="records"))

    @classmethod
    def delete_dataset(cls, dataset_id: str) -> None:
        """
        Remove stored dataset files for a dataset_id.
        """
        dataset_dir = cls._dataset_dir(dataset_id)
        if dataset_dir.exists():
            shutil.rmtree(dataset_dir, ignore_errors=True)
            logger.info(f"Removed dataset storage for {dataset_id}")
