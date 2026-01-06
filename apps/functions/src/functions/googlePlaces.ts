import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";

import { requireAuth } from "../auth/requireAuth";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";

function getGoogleMapsApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (typeof key === "string" && key.trim().length > 0) return key.trim();
  throw new Error("GOOGLE_MAPS_API_KEY is not set");
}

const AutocompleteQuerySchema = z.object({
  input: z.string().trim().min(1).max(200),
  // Optional ISO country code, e.g. 'us'
  country: z.string().trim().length(2).optional(),
  // Optional session token from client
  sessionToken: z.string().trim().min(1).max(200).optional(),
});

const DetailsQuerySchema = z.object({
  placeId: z.string().trim().min(1).max(200),
  sessionToken: z.string().trim().min(1).max(200).optional(),
});

function jsonError(req: HttpRequest, status: number, message: string, details?: unknown): HttpResponseInit {
  return {
    status,
    headers: corsHeaders(req),
    jsonBody: { ok: false, error: message, ...(typeof details !== "undefined" ? { details } : {}) },
  };
}

app.http("googlePlacesAutocomplete", {
  methods: ["GET", "OPTIONS"],
  route: "google/places/autocomplete",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      // Require auth so the proxy can't be abused anonymously.
      await requireAuth(req);

      const parsed = AutocompleteQuerySchema.safeParse({
        input: req.query.get("input"),
        country: req.query.get("country") ?? undefined,
        sessionToken: req.query.get("sessionToken") ?? undefined,
      });

      if (!parsed.success) {
        return jsonError(req, 400, "Invalid query", parsed.error.flatten());
      }

      const key = getGoogleMapsApiKey();

      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", parsed.data.input);
      url.searchParams.set("key", key);
      url.searchParams.set("types", "geocode");
      if (parsed.data.sessionToken) url.searchParams.set("sessiontoken", parsed.data.sessionToken);
      if (parsed.data.country) url.searchParams.set("components", `country:${parsed.data.country}`);

      const res = await fetch(url.toString());
      const json = await res.json().catch(() => null);

      const status = typeof json?.status === "string" ? json.status : "UNKNOWN";
      if (!res.ok) {
        ctx.warn("Google Places autocomplete HTTP error", { status: res.status });
        return jsonError(req, 502, `Google Places error (${res.status})`);
      }

      if (status !== "OK" && status !== "ZERO_RESULTS") {
        // Surface friendly-ish messages without leaking the API key.
        const msg = typeof json?.error_message === "string" ? json.error_message : null;
        return jsonError(req, 502, msg ?? `Google Places autocomplete failed (${status})`);
      }

      const predictions = Array.isArray(json?.predictions) ? json.predictions : [];

      // Pass through only the fields we care about.
      const mapped = predictions
        .map((p: any) => {
          const description = typeof p?.description === "string" ? p.description : null;
          const placeId = typeof p?.place_id === "string" ? p.place_id : null;
          if (!description || !placeId) return null;

          const structured = p?.structured_formatting;
          const primaryText = typeof structured?.main_text === "string" ? structured.main_text : null;
          const secondaryText = typeof structured?.secondary_text === "string" ? structured.secondary_text : null;

          return {
            description,
            placeId,
            primaryText,
            secondaryText,
          };
        })
        .filter(Boolean);

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, predictions: mapped },
      };
    } catch (e: unknown) {
      ctx.error(e);
      return jsonError(req, 401, e instanceof Error ? e.message : "Unauthorized");
    }
  },
});

app.http("googlePlaceDetails", {
  methods: ["GET", "OPTIONS"],
  route: "google/places/details",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      await requireAuth(req);

      const parsed = DetailsQuerySchema.safeParse({
        placeId: req.query.get("placeId"),
        sessionToken: req.query.get("sessionToken") ?? undefined,
      });

      if (!parsed.success) {
        return jsonError(req, 400, "Invalid query", parsed.error.flatten());
      }

      const key = getGoogleMapsApiKey();

      const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      url.searchParams.set("place_id", parsed.data.placeId);
      url.searchParams.set("fields", "name,formatted_address");
      url.searchParams.set("key", key);
      if (parsed.data.sessionToken) url.searchParams.set("sessiontoken", parsed.data.sessionToken);

      const res = await fetch(url.toString());
      const json = await res.json().catch(() => null);

      const status = typeof json?.status === "string" ? json.status : "UNKNOWN";
      if (!res.ok) {
        ctx.warn("Google Places details HTTP error", { status: res.status });
        return jsonError(req, 502, `Google Places error (${res.status})`);
      }

      if (status !== "OK") {
        const msg = typeof json?.error_message === "string" ? json.error_message : null;
        return jsonError(req, 502, msg ?? `Google Places details failed (${status})`);
      }

      const r = json?.result;
      const name = typeof r?.name === "string" ? r.name : null;
      const formattedAddress = typeof r?.formatted_address === "string" ? r.formatted_address : null;

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          details: {
            placeId: parsed.data.placeId,
            name,
            formattedAddress,
          },
        },
      };
    } catch (e: unknown) {
      ctx.error(e);
      return jsonError(req, 401, e instanceof Error ? e.message : "Unauthorized");
    }
  },
});
