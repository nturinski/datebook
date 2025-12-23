import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { db } from "../db/client";
import { users } from "../db/schema";
import { desc } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  email: z.email(),
});

app.http("usersCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "users",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const body = await req.json().catch(() => null);
      const parsed = bodySchema.safeParse(body);

      if (!parsed.success) {
        return {
          status: 400,
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
        jsonBody: { ok: true, user: inserted[0] },
      };
    } catch (err: any) {
      // Unique constraint (email) -> Postgres error code 23505
      if (err?.code === "23505") {
        return { status: 409, jsonBody: { ok: false, error: "Email already exists" } };
      }

      context.error("usersCreate failed", err);
      return { status: 500, jsonBody: { ok: false, error: "Internal error" } };
    }
  },
});

app.http("usersList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "users",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
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
        jsonBody: { ok: true, users: rows },
      };
    } catch (err: any) {
      context.error("usersList failed", err);
      return { status: 500, jsonBody: { ok: false, error: "Internal error" } };
    }
  },
});
