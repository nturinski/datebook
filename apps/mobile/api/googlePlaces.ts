export type GooglePlacesAutocompletePrediction = {
  description: string;
  placeId: string;
  primaryText?: string;
  secondaryText?: string;
};

export type GooglePlacesPlaceDetails = {
  placeId: string;
  name: string | null;
  formattedAddress: string | null;
};

type PlacesProxyAutocompleteResponse =
  | { ok: true; predictions: GooglePlacesAutocompletePrediction[] }
  | { ok: false; error: string; details?: unknown };

type PlacesProxyDetailsResponse =
  | { ok: true; details: GooglePlacesPlaceDetails }
  | { ok: false; error: string; details?: unknown };

async function apiFetchProxy<T>(path: string): Promise<T> {
  // Avoid circular dependencies by lazy import.
  const { apiFetch } = await import('@/api/client');
  return await apiFetch<T>(path);
}

function getPlacesApiKey(): string | null {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function newSessionToken(): string {
  // Session tokens help reduce cost and improve result quality for autocomplete flows.
  // Doesn't need to be cryptographically strong.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function ensurePlacesSessionToken(existing?: string | null): string {
  return typeof existing === 'string' && existing.trim().length > 0 ? existing : newSessionToken();
}

function parsePrediction(p: any): GooglePlacesAutocompletePrediction | null {
  const description = typeof p?.description === 'string' ? p.description : null;
  const placeId = typeof p?.place_id === 'string' ? p.place_id : null;
  if (!description || !placeId) return null;

  const structured = p?.structured_formatting;
  const primaryText = typeof structured?.main_text === 'string' ? structured.main_text : undefined;
  const secondaryText = typeof structured?.secondary_text === 'string' ? structured.secondary_text : undefined;

  return { description, placeId, primaryText, secondaryText };
}

export async function googlePlacesAutocomplete(args: {
  input: string;
  sessionToken?: string;
  // Optional: ISO country code, e.g. 'us'
  country?: string;
}): Promise<{ predictions: GooglePlacesAutocompletePrediction[]; sessionToken: string }> {
  // Expo Web runs in a browser and Google Places REST endpoints don't send CORS headers.
  // Route web through our backend proxy (which attaches CORS headers and keeps the API key server-side).
  if (typeof window !== 'undefined') {
    const sessionToken = ensurePlacesSessionToken(args.sessionToken);
    const url = new URL('/google/places/autocomplete', 'http://localhost');
    url.searchParams.set('input', args.input);
    url.searchParams.set('sessionToken', sessionToken);
    if (args.country) url.searchParams.set('country', args.country);

    const res = await apiFetchProxy<PlacesProxyAutocompleteResponse>(`${url.pathname}?${url.searchParams.toString()}`);
    if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Places autocomplete failed');

    return { predictions: res.predictions ?? [], sessionToken };
  }

  const key = getPlacesApiKey();
  if (!key) {
    throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (Places autocomplete disabled)');
  }

  const input = args.input.trim();
  if (input.length === 0) return { predictions: [], sessionToken: ensurePlacesSessionToken(args.sessionToken) };

  const sessionToken = ensurePlacesSessionToken(args.sessionToken);

  // Using the legacy REST endpoint for widest compatibility.
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('key', key);
  url.searchParams.set('sessiontoken', sessionToken);
  url.searchParams.set('types', 'geocode');

  if (args.country) {
    url.searchParams.set('components', `country:${args.country}`);
  }

  const res = await fetch(url.toString());
  const json = await res.json().catch(() => null);

  const status = typeof json?.status === 'string' ? json.status : 'UNKNOWN';
  if (!res.ok || status === 'REQUEST_DENIED' || status === 'INVALID_REQUEST' || status === 'UNKNOWN_ERROR') {
    const msg = typeof json?.error_message === 'string' ? json.error_message : null;
    throw new Error(msg ?? `Google Places autocomplete failed (${status})`);
  }

  if (status !== 'OK' && status !== 'ZERO_RESULTS') {
    // e.g. OVER_QUERY_LIMIT
    throw new Error(`Google Places autocomplete failed (${status})`);
  }

  const raw = Array.isArray(json?.predictions) ? json.predictions : [];
  const predictions = raw.map(parsePrediction).filter(Boolean) as GooglePlacesAutocompletePrediction[];
  return { predictions, sessionToken };
}

export async function googlePlaceDetails(args: {
  placeId: string;
  sessionToken?: string;
}): Promise<{ details: GooglePlacesPlaceDetails; sessionToken: string }> {
  // Web: use backend proxy to avoid browser CORS restrictions.
  if (typeof window !== 'undefined') {
    const sessionToken = ensurePlacesSessionToken(args.sessionToken);
    const url = new URL('/google/places/details', 'http://localhost');
    url.searchParams.set('placeId', args.placeId);
    url.searchParams.set('sessionToken', sessionToken);

    const res = await apiFetchProxy<PlacesProxyDetailsResponse>(`${url.pathname}?${url.searchParams.toString()}`);
    if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Places details failed');

    return { details: res.details, sessionToken };
  }

  const key = getPlacesApiKey();
  if (!key) {
    throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (Places details disabled)');
  }

  const sessionToken = ensurePlacesSessionToken(args.sessionToken);

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', args.placeId);
  url.searchParams.set('fields', 'name,formatted_address');
  url.searchParams.set('key', key);
  url.searchParams.set('sessiontoken', sessionToken);

  const res = await fetch(url.toString());
  const json = await res.json().catch(() => null);

  const status = typeof json?.status === 'string' ? json.status : 'UNKNOWN';
  if (!res.ok || status === 'REQUEST_DENIED' || status === 'INVALID_REQUEST' || status === 'UNKNOWN_ERROR') {
    const msg = typeof json?.error_message === 'string' ? json.error_message : null;
    throw new Error(msg ?? `Google Places details failed (${status})`);
  }

  if (status !== 'OK') {
    throw new Error(`Google Places details failed (${status})`);
  }

  const r = json?.result;
  const name = typeof r?.name === 'string' ? r.name : null;
  const formattedAddress = typeof r?.formatted_address === 'string' ? r.formatted_address : null;

  return {
    sessionToken,
    details: {
      placeId: args.placeId,
      name,
      formattedAddress,
    },
  };
}
