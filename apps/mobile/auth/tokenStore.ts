import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "datebook.session.jwt";
const USER_KEY = "datebook.session.user";

export type SessionUser = {
  id: string;
  email: string;
};

function hasLocalStorage(): boolean {
  return typeof globalThis !== "undefined" &&
    typeof (globalThis as any).localStorage !== "undefined";
}

async function webGet(): Promise<string | null> {
  if (!hasLocalStorage()) return null;
  return (globalThis as any).localStorage.getItem(TOKEN_KEY);
}

async function webSet(token: string): Promise<void> {
  if (!hasLocalStorage()) return;
  (globalThis as any).localStorage.setItem(TOKEN_KEY, token);
}

async function webClear(): Promise<void> {
  if (!hasLocalStorage()) return;
  (globalThis as any).localStorage.removeItem(TOKEN_KEY);
}

async function webGetJson<T>(key: string): Promise<T | null> {
  if (!hasLocalStorage()) return null;
  const raw = (globalThis as any).localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function webSetJson(key: string, value: unknown): Promise<void> {
  if (!hasLocalStorage()) return;
  (globalThis as any).localStorage.setItem(key, JSON.stringify(value));
}

async function webClearKey(key: string): Promise<void> {
  if (!hasLocalStorage()) return;
  (globalThis as any).localStorage.removeItem(key);
}

export async function getSessionToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return await webGet();
  }

  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setSessionToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    await webSet(token);
    return;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === "web") {
    await webClear();
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (Platform.OS === "web") {
    return await webGetJson<SessionUser>(USER_KEY);
  }

  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function setSessionUser(user: SessionUser): Promise<void> {
  if (Platform.OS === "web") {
    await webSetJson(USER_KEY, user);
    return;
  }

  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSessionUser(): Promise<void> {
  if (Platform.OS === "web") {
    await webClearKey(USER_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(USER_KEY);
}
