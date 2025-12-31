import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = new URL("https://appleid.apple.com/auth/keys");

// Cached remote keyset (jose caches internally too)
const appleJwks = createRemoteJWKSet(APPLE_JWKS_URL);

export type AppleClaims = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  isPrivateEmail: boolean;
};

function truthyBoolean(v: unknown): boolean {
  // Apple sometimes provides "true"/"false" strings in some fields
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

export async function verifyAppleIdToken(idToken: string, appleAudience: string): Promise<AppleClaims> {
  // appleAudience should be your Service ID (web) or Bundle ID (native), depending on your setup.
  // In Expo, this is commonly the iOS bundle identifier or the "clientId" used for Apple auth.
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: appleAudience,
  });

  const sub = payload.sub;
  if (!sub) throw new Error("Invalid Apple token: missing sub");

  const email = typeof payload.email === "string" ? payload.email : null;

  // Apple docs: email_verified and is_private_email often come as strings
  const emailVerified = truthyBoolean((payload as JWTPayload & any).email_verified);
  const isPrivateEmail = truthyBoolean((payload as JWTPayload & any).is_private_email);

  return { sub, email, emailVerified, isPrivateEmail };
}
