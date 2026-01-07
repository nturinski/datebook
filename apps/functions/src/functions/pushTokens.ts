import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "../auth/requireAuth";
import { db } from "../db/client";
import { users } from "../db/schema/users";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";

const BodySchema = z.object({
  // Allow null to clear on sign out / reinstall.
  token: z.string().min(10).max(1024).nullable(),
});

app.http("pushTokensRegister", {
  methods: ["POST", "OPTIONS"],
  route: "push-tokens/register",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const auth = await requireAuth(req);

      const raw = await req.json().catch(() => null);
      const parsed = BodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const token = parsed.data.token;

      await db
        .update(users)
        .set({ expoPushToken: token })
        .where(eq(users.id, auth.userId));

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true },
      };
    } catch (e: unknown) {
      ctx.error(e);
      return {
        status: 401,
        headers: corsHeaders(req),
        jsonBody: { ok: false, error: e instanceof Error ? e.message : "Unauthorized" },
      };
    }
  },
});
