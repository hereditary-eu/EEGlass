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
uv run fastapi dev backend/app.py --reload-dir backend/
bun dev
```

To format code:

```bash
ruff format
prettier -w .
```

Also useful: `ruff check --fix --unsafe-fixes`.

---

### Docker Deployment

Build and start the full stack:

```bash
docker compose up --build
```

The compose setup starts three services:

- `dataset-downloader`: downloads and extracts the configured dataset into the `datasets` Docker volume, then exits.
- `backend`: starts only after `dataset-downloader` completed successfully. It serves the API on <http://localhost:8000>.
- `frontend`: serves the UI on <http://localhost:3000>.

The default dataset is large. `docker-compose.yml` also contains a commented smaller dataset URL (only 5 patients instead of 88) that can be swapped into `DATASET_URL` to test the download flow without downloading the full 4.2 GB dataset.

Stop the running containers:

```bash
docker compose down
```

`docker compose down` removes containers and the compose network, but it does not remove named volumes. This means the downloaded dataset stays available in the `datasets` volume and will be reused on the next `docker compose up`.

To remove containers and volumes, including the downloaded dataset and model outputs:

```bash
docker compose down -v
```

Use `-v` only when you intentionally want to delete the persisted Docker volumes and force the dataset to be downloaded again.
