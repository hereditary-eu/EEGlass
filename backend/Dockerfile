FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

ENV DATASET_STORAGE_DIR=/app/data/datasets \
  MODEL_OUTPUT_STORAGE_DIR=/app/data/model_outputs \
  SERVER=true

RUN mkdir -p /app/data/datasets /app/data/model_outputs

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/__init__.py backend/app.py backend/config.py ./backend/
COPY backend/ml ./backend/ml
COPY backend/pydantic_models ./backend/pydantic_models
COPY backend/routers ./backend/routers
COPY backend/services ./backend/services
COPY backend/utils ./backend/utils
COPY main.py ./main.py

EXPOSE 8000

CMD [".venv/bin/fastapi", "run", "backend/app.py", "--host", "0.0.0.0", "--port", "8000"]
