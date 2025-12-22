import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { isDatabaseConfigError, pgQuery } from "../lib/postgres";

export async function health(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const startedAt = Date.now();
  context.log(`Health check request: ${request.method} ${request.url}`);

  try {
    const result = await pgQuery<{ now: string }>("select now() as now");
    const dbTime = result.rows[0]?.now;

    return {
      status: 200,
      jsonBody: {
        ok: true,
        dbTime,
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
      jsonBody: {
        ok: false,
        error: safeMessage,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
};

app.http('health', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: health
});
