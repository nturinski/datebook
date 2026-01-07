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

    throw new Error(`${hint} Original error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const baseMsg = (data && typeof data.error === "string" && data.error) || `Request failed (${res.status})`;

    // Include helpful debug context if the API provided it.
    const extras: string[] = [];
    if (data && typeof data.relationshipId === "string") extras.push(`currentRelationshipId=${data.relationshipId}`);
    if (data && typeof data.inviteRelationshipId === "string") extras.push(`inviteRelationshipId=${data.inviteRelationshipId}`);
    if (data && typeof data.currentMemberCount === "number") extras.push(`currentMemberCount=${data.currentMemberCount}`);

    // If the backend returned structured validation data (Zod flatten, etc), surface it.
    if (data && typeof data.details !== "undefined") {
      try {
        const raw = JSON.stringify(data.details);
        const trimmed = raw.length > 800 ? `${raw.slice(0, 800)}…` : raw;
        extras.push(`details=${trimmed}`);
      } catch {
        // ignore
      }
    }

    const msg = extras.length ? `${baseMsg} (${extras.join(", ")})` : baseMsg;
    throw new Error(msg);
  }

  // If parsing failed but response was OK, return the raw text.
  return (data ?? text) as T;
}
