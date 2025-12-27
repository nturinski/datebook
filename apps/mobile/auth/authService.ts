import { apiFetch } from "../api/client";
import { setSessionToken, setSessionUser, clearSessionToken, clearSessionUser } from "./tokenStore";

export type Provider = "google" | "apple";

type VerifyResponse = {
  token: string;
  user: { id: string; email: string };
};

export async function verifyProviderAndCreateSession(provider: Provider, idToken: string) {
  const res = await apiFetch<VerifyResponse>("/auth/verify", {
    method: "POST",
    json: { provider, idToken },
  });

  await setSessionToken(res.token);
  await setSessionUser(res.user);
  return res.user;
}

export async function signOut() {
  await clearSessionToken();
  await clearSessionUser();
}
