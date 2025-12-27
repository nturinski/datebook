import { getSessionToken } from "../auth/tokenStore";
import { getApiBaseUrl } from "../lib/datebook-api";

type Json = Record<string, unknown>;

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: Json } = {}
): Promise<T> {
  const API_BASE_URL = getApiBaseUrl();
  const token = await getSessionToken();

  const headers: Record<string, string> = {
    ...(init.headers as any),
  };

  if (init.json) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;

  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      body: init.json ? JSON.stringify(init.json) : init.body,
    });
  } catch (e) {
    const hint =
      `Network request failed. baseUrl=${API_BASE_URL} path=${path}. ` +
      `If you're on a physical device, 'localhost' points to the phone, not your PC. ` +
      `Also ensure your Azure Functions host is running and reachable on port 7071.`;

    throw new Error(hint);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg =
      (data && (data.error as string)) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}
