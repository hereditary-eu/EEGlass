FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

ENV DATASET_STORAGE_DIR=/app/data/datasets \
    MODEL_OUTPUT_STORAGE_DIR=/app/data/model_outputs \
    SERVER=true

RUN mkdir -p /app/data/datasets /app/data/model_outputs

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend ./backend
COPY main.py ./main.py

EXPOSE 8000

CMD ["uv", "run", "fastapi", "run", "backend/app.py", "--host", "0.0.0.0", "--port", "8000"]
