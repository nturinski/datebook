import { isDevAdminEnabled } from "../auth/isDevAdmin";
import { requireAuth } from "../auth/requireAuth";
import { db } from "../db/client";
import { users } from "../db/schema/users";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { eq } from "drizzle-orm";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";


// ...
export async function usersList(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const auth = await requireAuth(req);

    if (!isDevAdminEnabled()) {
      // Non-admin path: only return the caller
      const me = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
      return { status: 200, headers: corsHeaders(req), jsonBody: { users: me.map(u => ({ id: u.id, email: u.email })) } };
    }

    // Admin/dev path: return everyone
    const all = await db.select().from(users);
    return { status: 200, headers: corsHeaders(req), jsonBody: { users: all.map(u => ({ id: u.id, email: u.email })) } };
  } catch (e: any) {
    ctx.error(e);
    return { status: 401, headers: corsHeaders(req), jsonBody: { error: e?.message ?? "Unauthorized" } };
  }
}

app.http("users-list", {
  methods: ["GET", "OPTIONS"],
  route: "dev/users",
  authLevel: "anonymous",
  handler: usersList,
});
