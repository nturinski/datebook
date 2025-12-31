import { SignJWT, jwtVerify } from "jose";

const ISSUER = "datebook-api";
const AUDIENCE = "datebook-app";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET missing or too short (use 32+ chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function issueSessionJwt(input: {
  userId: string;
  provider: "google" | "apple";
  providerSub: string;
}) {
  const secret = getJwtSecret();

  return new SignJWT({
    uid: input.userId,
    prv: input.provider,
    sub: input.providerSub,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret);
}

export async function verifySessionJwt(token: string) {
  const secret = getJwtSecret();
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  // Minimal shape check
  if (typeof payload.uid !== "string") throw new Error("Invalid session: missing uid");
  return {
    userId: payload.uid as string,
    provider: payload.prv as "google" | "apple",
    providerSub: payload.sub as string,
  };
}
