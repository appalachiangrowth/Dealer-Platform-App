import * as SecureStore from 'expo-secure-store';

/**
 * API base URL.
 *  1. the address typed in the app (Login > Server, or Business > App info) — kept on the device
 *  2. EXPO_PUBLIC_API_URL from .env / eas.json
 *  3. the live Contabo VPS backend (same default as dealer-portal/next.config.ts)
 */
export const DEFAULT_API_URL = 'https://api.revixasolutions.com';
const OVERRIDE_KEY = 'dp_api_url';

export function cleanUrl(raw: string): string {
  let u = String(raw || '').replace(/[<>[\]()\s]/g, '').replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

export const ENV_API_URL = cleanUrl(process.env.EXPO_PUBLIC_API_URL || '') || DEFAULT_API_URL;

let current = ENV_API_URL;

export function getApiUrl(): string {
  return current;
}

/** Call once at app start (before the first request). */
export async function loadApiUrl(): Promise<string> {
  try {
    const saved = await SecureStore.getItemAsync(OVERRIDE_KEY);
    if (saved) current = cleanUrl(saved) || ENV_API_URL;
  } catch {
    /* keep the default */
  }
  return current;
}

/** Empty value = back to the built-in address. */
export async function setApiUrl(raw: string): Promise<string> {
  const u = cleanUrl(raw);
  current = u || ENV_API_URL;
  try {
    if (u && u !== ENV_API_URL) await SecureStore.setItemAsync(OVERRIDE_KEY, u);
    else await SecureStore.deleteItemAsync(OVERRIDE_KEY);
  } catch {
    /* not remembered */
  }
  return current;
}
