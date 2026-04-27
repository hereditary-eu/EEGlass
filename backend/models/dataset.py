from typing import Dict, List, Optional, Union

from pydantic import BaseModel


class CSVDataRequest(BaseModel):
    data: List[Dict[str, Optional[Union[str, float, int, None]]]]
    filename: Optional[str] = None


class DatasetInfo(BaseModel):
    id: str
    filename: Optional[str] = None
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    storage_format: Optional[str] = None


class DatasetListResponse(BaseModel):
    datasets: List[DatasetInfo]
