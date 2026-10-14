import { buildQuery, type QueryValue } from '@/lib/url';

const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Network failure or timeout: the server never answered. */
export class NetworkError extends Error {
  timedOut: boolean;

  constructor(message: string, timedOut: boolean) {
    super(message);
    this.name = 'NetworkError';
    this.timedOut = timedOut;
  }
}

type ApiState = {
  baseUrl: string | null;
  token: string | null;
  onUnauthorized: (() => void) | null;
};

const state: ApiState = { baseUrl: null, token: null, onUnauthorized: null };

/** Called by the session provider whenever the server or token changes. */
export function configureApi(next: Partial<ApiState>) {
  Object.assign(state, next);
}

export function getBaseUrl(): string {
  if (!state.baseUrl) throw new Error('No server configured');
  return state.baseUrl;
}

export function getToken(): string | null {
  return state.token;
}

/** Absolute URL for `<base>/api/<path>`; also used for media, thumbnails and downloads. */
export function apiUrl(path: string, params?: Record<string, QueryValue>, base = getBaseUrl()) {
  return `${base}/api/${path.replace(/^\/+/, '')}${buildQuery(params)}`;
}

export function authHeaders(): Record<string, string> {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  /** Serialized as JSON with a matching Content-Type. */
  json?: unknown;
  body?: BodyInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Send the bearer token (default true). */
  auth?: boolean;
  /**
   * Treat a 401 as an expired session (default true). Off for calls where 401 means a wrong
   * password in X-Password rather than a bad token.
   */
  sessionOn401?: boolean;
  /** Override the configured server, e.g. while probing a new one. */
  baseUrl?: string;
};

function timeoutSignal(ms: number, outer?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  const onAbort = () => controller.abort();
  outer?.addEventListener('abort', onAbort);
  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

/** Best-effort error text: the backend answers errors as `{"status":..,"message":".."}`. */
export function messageFromBody(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) return parsed.message;
  } catch {
    // Not JSON; fall through to the raw text.
  }
  const text = body.trim();
  return text && text.length < 300 && !text.startsWith('<') ? text : fallback;
}

export async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  const {
    method = 'GET',
    params,
    json,
    signal,
    auth = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;
  const headers: Record<string, string> = { ...(auth ? authHeaders() : {}), ...opts.headers };
  let body = opts.body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const timer = timeoutSignal(timeoutMs, signal);
  let res: Response;
  try {
    res = await fetch(apiUrl(path, params, opts.baseUrl), {
      method,
      headers,
      body,
      signal: timer.signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    const timedOut = timer.didTimeOut();
    throw new NetworkError(
      timedOut ? 'The request timed out' : e instanceof Error ? e.message : String(e),
      timedOut,
    );
  } finally {
    timer.dispose();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 && auth && state.token && opts.sessionOn401 !== false) {
      state.onUnauthorized?.();
    }
    throw new ApiError(messageFromBody(text, `HTTP ${res.status}`), res.status, text);
  }
  return res;
}

export async function requestJson<T>(path: string, opts?: RequestOptions): Promise<T> {
  const res = await request(path, opts);
  return (await res.json()) as T;
}
