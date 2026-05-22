FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json ./
RUN bun install --frozen-lockfile

FROM deps AS build

WORKDIR /app

COPY frontend ./frontend
ARG BASE_PATH=/all-in-on-eeg/
RUN printf 'BUN_PUBLIC_BASE_PATH=%s\nBUN_PUBLIC_API_BASE_URL=%s\n' "${BASE_PATH}" "${BASE_PATH}" > .env
RUN bun run build

FROM nginx:alpine

RUN sed -i 's/worker_processes\s\+auto/worker_processes 4/' /etc/nginx/nginx.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
