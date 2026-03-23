import { buildApiUrl } from "../../../shared/runtimeConfig";

export async function apiPost(path: string, body: unknown) {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API ERROR: ${response.status}`);
  }

  return response.json();
}
