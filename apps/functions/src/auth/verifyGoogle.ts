import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client();

export async function verifyGoogleIdToken(idToken: string, googleAudience: string | string[]) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: googleAudience,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error("Invalid Google token: missing sub");

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified ?? false,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}
