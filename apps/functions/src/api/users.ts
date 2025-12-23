const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:7071/api";

export async function createUser(email: string) {
  const res = await fetch(`${API_BASE_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed: ${res.status}`);
  }
  return data;
}
