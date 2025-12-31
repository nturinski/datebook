import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders } from "../lib/cors";

export async function corsPreflight(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  return {
    status: 204,
    headers: corsHeaders(req),
  };
}

// Catch-all OPTIONS handler so browser preflights never 404.
// With the default routePrefix "api", this matches: /api/<anything>
app.http("cors-preflight", {
  methods: ["OPTIONS"],
  authLevel: "anonymous",
  route: "{*path}",
  handler: corsPreflight,
});
