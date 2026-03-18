from fastapi import APIRouter
from typing import Union

debug_router = APIRouter(prefix="/debug", tags=["debug"])


# ------------------------------------------------------------
# Routes
# ------------------------------------------------------------


@debug_router.get("/ping")
async def ping():
    return {"message": "pong"}


@debug_router.get("/")
async def read_root():
    return {"Hello": "World", "From": "The Python Backend!"}


@debug_router.get("/items/{item_id}")
async def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}


@debug_router.get("/stream")
async def stream():
    return "hi"
