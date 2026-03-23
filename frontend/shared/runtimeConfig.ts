function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveLocalDevApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8000`;
}

export function getApiBaseUrl() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
  const configured = env.BUN_PUBLIC_API_BASE_URL;

  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return resolveLocalDevApiBaseUrl();
  }

  return trimTrailingSlash(window.location.origin);
}

export function buildApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
