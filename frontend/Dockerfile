FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json ./
RUN bun install --frozen-lockfile

FROM deps AS build

WORKDIR /app

COPY frontend ./frontend
ARG BASE_PATH=/all-in-on-eeg/
RUN BUN_PUBLIC_API_BASE_URL="." BUN_PUBLIC_BASE_PATH="$BASE_PATH" bun run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
