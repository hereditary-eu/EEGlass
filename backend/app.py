from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import CONFIG
from backend.routers import (
    timeseries_router,
    model_router,
)
from backend.utils.mne_logging import configure_mne_logging

configure_mne_logging()


def create_app():
    app = FastAPI(
        title=CONFIG.TITLE,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CONFIG.ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(timeseries_router)
    app.include_router(model_router)

    return app


app = create_app()
