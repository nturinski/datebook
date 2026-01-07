import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type HealthOk = {
  ok: true;
  dbTime?: string;
  latencyMs: number;
};

export type HealthError = {
  ok: false;
  error: string;
  latencyMs: number;
};

export type HealthResponse = HealthOk | HealthError;

export type CreateUserOk = {
  ok: true;
  user: {
    id: string;
    email: string;
    createdAt?: string;
  };
};

export type CreateUserError = {
  ok: false;
  error: string;
  details?: unknown;
};

export type CreateUserResponse = CreateUserOk | CreateUserError;

const DEFAULT_TIMEOUT_MS = 8000;

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeEnvBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Special value to force dynamic discovery (useful in dev when DHCP changes).
  if (trimmed.toLowerCase() === 'auto') return null;

  return trimmed;
}

function guessDevHostIp(): string | null {
  // Expo dev host fields commonly look like:
  // - hostUri: "192.168.1.50:8081" (or sometimes "localhost:8081")
  // - debuggerHost: "192.168.1.50:8081"
  const hostLike =
    // Most reliable when present
    (Constants as any)?.expoConfig?.debuggerHost ??
    (Constants as any)?.manifest2?.extra?.expoClient?.debuggerHost ??
    (Constants as any)?.manifest?.debuggerHost ??
    // Fallback
    Constants.expoConfig?.hostUri ??
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ??
    (Constants as any)?.manifest?.hostUri;

  if (typeof hostLike !== 'string' || hostLike.length === 0) return null;

  const host = hostLike.split(':')[0];
  if (!host) return null;

  // Some environments report "localhost" which won't work for a physical device.
  if (host === 'localhost' || host === '127.0.0.1') return null;

  return host;
}

/**
 * Base URL for the Functions host, including route prefix.
 *
 * Expected final shape: http(s)://HOST:7071/api
 */
export function getApiBaseUrl(): string {
  const fromEnvWeb = normalizeEnvBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL_WEB);
  const fromEnvAndroid = normalizeEnvBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL_ANDROID);
  const fromEnvIos = normalizeEnvBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL_IOS);
  const fromEnv = normalizeEnvBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

  if (Platform.OS === 'web' && typeof fromEnvWeb === 'string' && fromEnvWeb.length > 0) {
    const normalized = withoutTrailingSlash(fromEnvWeb);
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
  }

  if (Platform.OS === 'android' && typeof fromEnvAndroid === 'string' && fromEnvAndroid.length > 0) {
    const normalized = withoutTrailingSlash(fromEnvAndroid);
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
  }

  if (Platform.OS === 'ios' && typeof fromEnvIos === 'string' && fromEnvIos.length > 0) {
    const normalized = withoutTrailingSlash(fromEnvIos);
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
  }

  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    const normalized = withoutTrailingSlash(fromEnv);

    // Accept either:
    //   http://host:7071
    //   http://host:7071/api
    // but always return a base that includes the route prefix.
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
  }

  // Web dev: prefer the current page hostname.
  // This avoids relying on Expo Constants fields that can be stale/incorrect on web
  // (e.g. pointing at an IP not assigned to this machine).
  if (__DEV__ && Platform.OS === 'web') {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';

    // Most dev setups are http. If you're running the web app over https,
    // you'll need to run Functions with https too (otherwise the browser blocks mixed content).
    const proto = protocol === 'https:' ? 'https' : 'http';

    if (hostname) {
      return `${proto}://${hostname}:7071/api`;
    }

    return 'http://localhost:7071/api';
  }

  const devHostIp = guessDevHostIp();
  if (__DEV__ && devHostIp) {
    return `http://${devHostIp}:7071/api`;
  }

  // Emulator/simulator fallbacks for local development.
  if (__DEV__) {
    if (Platform.OS === 'android') return 'http://10.0.2.2:7071/api';
    return 'http://localhost:7071/api';
  }

  throw new Error(
    'Missing API base URL. Set EXPO_PUBLIC_API_BASE_URL (for example: https://your-api.example.com/api).'
  );
}

async function fetchJson<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');

    if (!res.ok) {
      // Try to read a JSON error body, otherwise fall back to text.
      const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');
      const details = typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
      throw new Error(`HTTP ${res.status} ${res.statusText}${details ? `: ${details}` : ''}`);
    }

    if (!isJson) {
      const text = await res.text();
      throw new Error(`Expected JSON but got: ${contentType || '(no content-type)'}; body=${text}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getHealth(): Promise<HealthResponse> {
  const baseUrl = getApiBaseUrl();
  return await fetchJson<HealthResponse>(`${baseUrl}/health`);
}

export async function createUser(email: string): Promise<CreateUserResponse> {
  const baseUrl = getApiBaseUrl();
  return await fetchJson<CreateUserResponse>(`${baseUrl}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
}
