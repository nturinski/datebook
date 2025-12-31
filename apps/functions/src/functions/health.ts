import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { isDatabaseConfigError, pgQuery } from "../lib/postgres";
import { db} from "../db/client";
import { events } from "../db/schema/schema";
import { eq } from "drizzle-orm";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";

export async function health(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const startedAt = Date.now();
  context.log(`Health check request: ${request.method} ${request.url}`);

  try {
    const result = await db
    .select()
    .from(events);

    console.log(result);

    return {
      status: 200,
      headers: corsHeaders(request),
      jsonBody: {
        ok: true,
        dbTime: result,
        latencyMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    const safeMessage = isDatabaseConfigError(err)
      ? (err as Error).message
      : "Database query failed";

    context.log("Health DB error:", err);

    return {
      status: 500,
      headers: corsHeaders(request),
      jsonBody: {
        ok: false,
        error: safeMessage,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
};

app.http('health', {
  methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: health
});
