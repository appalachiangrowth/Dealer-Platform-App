import * as SecureStore from 'expo-secure-store';
import { getApiUrl } from './config';

/**
 * Typed client for the NestJS backend — the same contract as dealer-portal/lib/api.ts:
 *  - Authorization: Bearer <JWT from POST /auth/login>   (no cookies, no refresh token; the JWT lasts 7 days)
 *  - dealer logins work on their own dealership (it is inside the token)
 *  - platform owners ("support mode") choose one with the X-Tenant-Id header on every /dealer/* call
 *  - 401 anywhere except the login call = the session ended: the token is removed and the app returns to Login
 */
const TOKEN_KEY = 'dp_token';
const SUPPORT_KEY = 'dp_support_tenant';

let token = '';
let supportTenant = '';
let onUnauthorized: (() => void) | null = null;

export const auth = {
  token: () => token,
  supportTenant: () => supportTenant,
  async load() {
    try {
      token = (await SecureStore.getItemAsync(TOKEN_KEY)) || '';
      supportTenant = (await SecureStore.getItemAsync(SUPPORT_KEY)) || '';
    } catch {
      token = '';
      supportTenant = '';
    }
    return token;
  },
  async setToken(t: string) {
    token = t;
    await SecureStore.setItemAsync(TOKEN_KEY, t);
  },
  async setSupportTenant(id: string) {
    supportTenant = id.trim();
    if (supportTenant) await SecureStore.setItemAsync(SUPPORT_KEY, supportTenant);
    else await SecureStore.deleteItemAsync(SUPPORT_KEY).catch(() => undefined);
  },
  async clear() {
    token = '';
    supportTenant = '';
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(SUPPORT_KEY).catch(() => undefined);
  },
  onUnauthorized(fn: (() => void) | null) {
    onUnauthorized = fn;
  },
};

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export type ApiOpts = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** ms, default 30 s (uploads and Facebook calls pass more) */
  timeout?: number;
};

function headersFor(path: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (supportTenant && path.startsWith('/dealer/')) h['X-Tenant-Id'] = supportTenant;
  return h;
}

function messageOf(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message?: unknown }).message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}

function parse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function fail(status: number, data: unknown, path: string): never {
  if (status === 401 && !path.startsWith('/auth/login')) {
    void auth.clear();
    onUnauthorized?.();
  }
  throw new ApiError(status, messageOf(data, status ? `Request failed (${status})` : 'Something went wrong'), data);
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers = headersFor(path);
  let body: string | FormData | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 30_000);
  let res: Response;
  try {
    res = await fetch(getApiUrl() + path, { method: opts.method || (body ? 'POST' : 'GET'), headers, body, signal: ctrl.signal });
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError';
    throw new ApiError(0, aborted ? 'The server took too long to answer. Please try again.' : `Cannot reach the server (${getApiUrl()}). Check your internet connection.`, null);
  } finally {
    clearTimeout(timer);
  }
  const data = parse(await res.text());
  if (!res.ok) fail(res.status, data, path);
  return data as T;
}

/** Absolute URL of an uploaded photo ("/uploads/…" and "/themes/…" live on the API server). */
export function mediaUrl(u?: string | null): string {
  if (!u) return '';
  return u.startsWith('/uploads/') || u.startsWith('/themes/') ? getApiUrl() + u : u;
}

export type MediaFile = { id: string; url: string; mime: string; size: number; width: number | null; height: number | null; enhanced?: boolean; enhanceNote?: string };
export type UploadAsset = { uri: string; name?: string | null; mimeType?: string | null };

/**
 * POST /dealer/media (multipart/form-data, field "files") — one photo per request, with upload progress.
 *  - no folder: a vehicle photo; the server always stores it as .jpeg (EXIF rotation applied)
 *  - folder "site": logo / website image (PNG stays PNG)
 *  - enhance: ?enhance=1 = "Auto White Studio Background" (vehicle photos only)
 * Answer: { files: [{ url, … }], errors: [{ file, error }] }
 */
export function uploadPhoto(asset: UploadAsset, opts: { folder?: 'site'; enhance?: boolean; onProgress?: (fraction: number) => void } = {}): Promise<MediaFile> {
  const q: string[] = [];
  if (opts.folder) q.push(`folder=${opts.folder}`);
  if (opts.enhance && !opts.folder) q.push('enhance=1');
  const path = `/dealer/media${q.length ? `?${q.join('&')}` : ''}`;
  const ext = (asset.uri.split(/[?#]/)[0].match(/\.([a-zA-Z0-9]{2,5})$/) || [])[1] || 'jpg';
  const name = asset.name || `photo-${Date.now()}.${ext}`;
  const type = asset.mimeType || (ext.toLowerCase() === 'png' ? 'image/png' : ext.toLowerCase() === 'heic' ? 'image/heic' : 'image/jpeg');
  const form = new FormData();
  // React Native file part: { uri, name, type }
  form.append('files', { uri: asset.uri, name, type } as unknown as Blob);

  return new Promise<MediaFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', getApiUrl() + path);
    const h = headersFor(path);
    for (const k of Object.keys(h)) xhr.setRequestHeader(k, h[k]);
    xhr.timeout = 180_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onerror = () => reject(new ApiError(0, 'The photo could not be uploaded. Check your internet connection.', null));
    xhr.ontimeout = () => reject(new ApiError(0, 'The upload took too long. Please try again.', null));
    xhr.onload = () => {
      const data = parse(xhr.responseText || '');
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          fail(xhr.status, data, path);
        } catch (e) {
          reject(e);
        }
        return;
      }
      const r = (data || {}) as { files?: MediaFile[]; errors?: { file: string; error: string }[] };
      const f = r.files?.[0];
      if (f?.url) resolve(f);
      else reject(new ApiError(400, r.errors?.[0]?.error || 'The photo could not be saved.', data));
    };
    xhr.send(form);
  });
}
