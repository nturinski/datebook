import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { db } from "../db/client";
import { users } from "../db/schema/schema";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";

const bodySchema = z.object({
  email: z.email(),
});

app.http("usersCreate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "users",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const body = await req.json().catch(() => null);
      const parsed = bodySchema.safeParse(body);

      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const { email } = parsed.data;

      const inserted = await db
        .insert(users)
        .values({ email })
        .returning({
          id: users.id,
          email: users.email,
          createdAt: users.createdAt,
        });

      return {
        status: 201,
        headers: corsHeaders(req),
        jsonBody: { ok: true, user: inserted[0] },
      };
    } catch (err: any) {
      // Unique constraint (email) -> Postgres error code 23505
      if (err?.code === "23505") {
        return { status: 409, headers: corsHeaders(req), jsonBody: { ok: false, error: "Email already exists" } };
      }

      context.error("usersCreate failed", err);
      return { status: 500, headers: corsHeaders(req), jsonBody: { ok: false, error: "Internal error" } };
    }
  },
});

app.http("usersList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "users/list",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const limitRaw = req.query.get("limit");
      const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : 100;
      const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 500) : 100;

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit);

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, users: rows },
      };
    } catch (err: any) {
      context.error("usersList failed", err);
      return { status: 500, headers: corsHeaders(req), jsonBody: { ok: false, error: "Internal error" } };
    }
  },
});
