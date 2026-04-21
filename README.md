# All In On(e) EEG

Combination of all frontend and backend utilities, and baseline for xEEG dashboard development.

To install dependencies:

```bash
uv install
bun install
```

If uv version is newer, use:

```
uv sync
```

To start a development server:

```bash
uv run fastapi dev backend/app.py
bun dev
```

To format code:

```bash
ruff format
prettier -w .
```

Also useful: `ruff check --fix --unsafe-fixes`.
