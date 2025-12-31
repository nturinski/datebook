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
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    const normalized = withoutTrailingSlash(fromEnv);

    // Accept either:
    //   http://host:7071
    //   http://host:7071/api
    // but always return a base that includes the route prefix.
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
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
