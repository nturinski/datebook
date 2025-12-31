import { HttpRequest } from "@azure/functions";
import { verifySessionJwt } from "./sessionJwt";

export type AuthContext = {
  userId: string;
  provider: "google" | "apple";
  providerSub: string;
};

export async function requireAuth(req: HttpRequest): Promise<AuthContext> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) throw new Error("Missing Authorization header");

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Invalid Authorization header (expected Bearer token)");

  const token = match[1].trim();
  return await verifySessionJwt(token);
}
