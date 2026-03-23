
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import CONFIG
from backend.routers import (
    debug_router,
    dataset_router,
    clustering_router,
    shapley_router,
    chat_router,
)


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

    app.include_router(debug_router)
    app.include_router(dataset_router)
    app.include_router(clustering_router)
    app.include_router(shapley_router)
    app.include_router(chat_router)

    return app


app = create_app()
