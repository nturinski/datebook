// packages/functions/src/functions/auth-verify.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { db } from "../db/client";
import { users } from "../db/schema/users";
import { and, eq, sql } from "drizzle-orm";
import { verifyGoogleIdToken } from "../auth/verifyGoogle";
import { issueSessionJwt } from "../auth/sessionJwt";
import { verifyAppleIdToken } from "../auth/verifyApple";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";
import { decodeJwt } from "jose";

const BodySchema = z.object({
    provider: z.enum(["google", "apple"]),
    idToken: z.string().min(20),
});

function parseGoogleAudiences(): string[] {
    const rawList = process.env.GOOGLE_CLIENT_IDS;
    if (rawList) {
        const list = rawList
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        if (list.length > 0) return list;
    }

    const single = process.env.GOOGLE_CLIENT_ID;
    return single ? [single] : [];
}

export async function authVerify(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    let rawBody: unknown = null;

    try {
        rawBody = await req.json().catch(() => null);
        const body = BodySchema.parse(rawBody);

        if (body.provider !== "google" && body.provider !== "apple") {
            return { status: 501, headers: corsHeaders(req), jsonBody: { error: "Unknown provider" } };
        }

        let provider: 'google' | 'apple' | undefined;
        let providerSub: string | undefined;
        let claims: { sub: string; email?: string | null } | undefined;

        if (body.provider === "google") {
            const googleAudiences = parseGoogleAudiences();
            if (googleAudiences.length === 0) {
                throw new Error("Missing GOOGLE_CLIENT_ID (or GOOGLE_CLIENT_IDS)");
            }

            claims = await verifyGoogleIdToken(body.idToken, googleAudiences);

            // Prefer "sub" as the canonical identity; email can change, sub should not.
            provider = "google";
            providerSub = claims.sub;
        } else {
            const appleAudience = process.env.APPLE_AUDIENCE; // Bundle ID or Service ID
            if (!appleAudience) throw new Error("Missing APPLE_AUDIENCE");

            claims = await verifyAppleIdToken(body.idToken, appleAudience);

            provider = "apple";
            providerSub = claims.sub;
        }

                // 1) Find existing user by provider identity
                const existing = await db
                    .select()
                    .from(users)
                    .where(and(eq(users.provider, provider), eq(users.providerSub, providerSub)))
                    .limit(1);

                let user = existing[0];

                // 2) Backward compatibility: older rows were created with just an email (provider/providerSub NULL).
                // If we have an email and no provider-identity match, try to find by email and "upgrade" that row.
                if (!user && claims?.email) {
                    const email = claims.email;

                    const byEmail = await db
                        .select()
                        .from(users)
                        .where(sql`lower(${users.email}) = lower(${email})`)
                        .limit(1);

                    const emailUser = byEmail[0];
                    if (emailUser) {
                        const hasProviderIdentity = Boolean(emailUser.provider) || Boolean(emailUser.providerSub);

                        if (!hasProviderIdentity) {
                            // Upgrade the legacy row to be tied to this provider identity.
                            const updated = await db
                                .update(users)
                                .set({
                                    email, // keep email current
                                    provider,
                                    providerSub,
                                })
                                .where(eq(users.id, emailUser.id))
                                .returning();

                            user = updated[0];
                        } else if (emailUser.provider === provider && emailUser.providerSub === providerSub) {
                            user = emailUser;
                        } else {
                            // This email is already linked to a different provider identity.
                            // MVP: block to avoid silently creating duplicate users for the same email.
                            return {
                                status: 409,
                                headers: corsHeaders(req),
                                jsonBody: { ok: false, error: "Email already linked to another account" },
                            };
                        }
                    }
                }

                // 3) Still no match -> create a new user
                if (!user) {
                    // Email might be null if provider didn't supply; handle your constraints accordingly.
                    const email = claims?.email ?? `${provider}_${providerSub}@noemail.local`;

                    const inserted = await db
                        .insert(users)
                        .values({
                            email,
                            provider,
                            providerSub,
                        })
                        .returning();

                    user = inserted[0];
                }

        // Mint your own session JWT
        const token = await issueSessionJwt({
            userId: user.id,
            provider,
            providerSub,
        });

        return { status: 200, headers: corsHeaders(req), jsonBody: { token, user: { id: user.id, email: user.email } } };
    } catch (e: unknown) {
        ctx.error(e);
        const message = e instanceof Error ? e.message : "Bad Request";
        const isConfigError = typeof message === "string" && message.startsWith("Missing ");

        // If we can, add a tiny bit of diagnostic context for audience mismatches.
        // This is the most common local-dev error.
        let details: unknown = undefined;
        if (typeof message === "string" && message.includes("payload audience")) {
            try {
                const maybeBody = rawBody as { idToken?: unknown } | null;
                const idToken = typeof maybeBody?.idToken === "string" ? maybeBody.idToken : null;
                const payload = idToken ? decodeJwt(idToken) : null;
                details = {
                    tokenAud: payload?.aud ?? null,
                    requiredAudience: parseGoogleAudiences(),
                };
            } catch {
                // ignore
            }
        }

        return {
            status: isConfigError ? 500 : 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: message, ...(details ? { details } : {}) },
        };
    }
}

app.http("auth-verify", {
    methods: ["POST", "OPTIONS"],
    route: "auth/verify",
    authLevel: "anonymous",
    handler: authVerify,
});
