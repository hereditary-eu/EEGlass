import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from backend.config import CONFIG
from backend.routers import (
    model_router,
    settings_router,
    timeseries_router,
)
from backend.services.embedding_service import warm_up_umap
from backend.utils.mne_logging import configure_mne_logging

configure_mne_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Prime UMAP's JIT.
    warmup_task = asyncio.create_task(asyncio.to_thread(warm_up_umap))
    try:
        yield
    finally:
        if not warmup_task.done():
            warmup_task.cancel()
        with suppress(asyncio.CancelledError):
            await warmup_task


def create_app():
    app = FastAPI(
        title=CONFIG.TITLE,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CONFIG.ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Timeseries-Signal-Metadata"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=CONFIG.GZIP_MINIMUM_SIZE)

    app.include_router(timeseries_router)
    app.include_router(model_router)
    app.include_router(settings_router)

    return app


app = create_app()
