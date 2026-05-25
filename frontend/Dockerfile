FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json ./

# Bun workspaces require each workspace's package.json to be present before
# install. Copy only the manifests so the install layer stays cacheable.
COPY frontend/src/vacp/protocol/core/package.json frontend/src/vacp/protocol/core/
COPY frontend/src/vacp/protocol/diagrams/package.json frontend/src/vacp/protocol/diagrams/
COPY frontend/src/vacp/protocol/gateway/package.json frontend/src/vacp/protocol/gateway/
COPY frontend/src/vacp/protocol/kit/package.json frontend/src/vacp/protocol/kit/
COPY frontend/src/vacp/providers/vega-lite/package.json frontend/src/vacp/providers/vega-lite/
COPY frontend/src/vacp/tooling/debug-ui/package.json frontend/src/vacp/tooling/debug-ui/
COPY frontend/src/vacp/transports/agent-client/package.json frontend/src/vacp/transports/agent-client/

RUN bun install --frozen-lockfile

FROM deps AS build

WORKDIR /app

COPY frontend ./frontend

# Re-link workspace node_modules now that the full workspace sources exist.
# The package cache from the deps stage is reused, so this is fast.
RUN bun install --frozen-lockfile

ARG BASE_PATH=/all-in-on-eeg/
RUN printf 'BUN_PUBLIC_BASE_PATH=%s\nBUN_PUBLIC_API_BASE_URL=%s\n' "${BASE_PATH}" "${BASE_PATH}" > .env
RUN bun run build

FROM nginx:alpine

RUN sed -i 's/worker_processes\s\+auto/worker_processes 4/' /etc/nginx/nginx.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
