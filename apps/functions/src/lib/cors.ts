import type { HttpRequest, HttpResponseInit } from "@azure/functions";

function parseAllowList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * CORS headers for browser-based clients.
 *
 * - If CORS_ORIGINS is unset: allow all origins (dev-friendly).
 * - If CORS_ORIGINS is set: only allow matching request Origin.
 */
export function corsHeaders(req: HttpRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowList = parseAllowList(process.env.CORS_ORIGINS);

  const allowOrigin = (() => {
    // Non-browser clients often omit Origin; don't block them.
    if (!origin) return "*";

    // Default (dev): allow all.
    if (allowList.length === 0) return "*";

    if (allowList.includes("*")) return "*";

    if (allowList.includes(origin)) return origin;

    // No match: omit CORS headers -> browser will block.
    return "";
  })();

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Max-Age": "86400",
  };

  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;

    // Only needed when echoing a specific origin.
    if (allowOrigin !== "*") {
      headers["Vary"] = "Origin";
    }
  }

  return headers;
}

export function handleCorsPreflight(req: HttpRequest): HttpResponseInit | null {
  if (req.method !== "OPTIONS") return null;

  return {
    status: 204,
    headers: corsHeaders(req),
  };
}
