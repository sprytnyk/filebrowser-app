import { ApiError, NetworkError, request } from '@/api/client';
import { type ServerGlobals, type ServerInfo } from '@/api/types';

export const DEFAULT_GLOBALS: ServerGlobals = {
  name: 'FileBrowser Quantum',
  version: '',
  passwordAvailable: true,
  ldapAvailable: false,
  enableThumbs: true,
  minSearchLength: 3,
  passwordMinLength: 5,
  mediaAvailable: false,
  proxyAvailable: false,
};

export class NotFilebrowserError extends Error {
  constructor() {
    super('Not a FileBrowser Quantum server');
    this.name = 'NotFilebrowserError';
  }
}

const CONFIG_SCRIPT = /<script id="app-config" type="application\/json">([\s\S]*?)<\/script>/;

/**
 * There is no public config endpoint, so read the `globalVars` JSON the backend embeds in its
 * web page (backend/internal/web/static.go). `version` is only filled in for signed-in users.
 */
export async function fetchGlobals(baseUrl: string, token?: string): Promise<ServerGlobals> {
  try {
    const res = await fetch(`${baseUrl}/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const match = CONFIG_SCRIPT.exec(await res.text());
    if (!match) return DEFAULT_GLOBALS;
    const raw = JSON.parse(match[1]) as Partial<ServerGlobals>;
    return {
      name: raw.name || DEFAULT_GLOBALS.name,
      version: raw.version ?? '',
      passwordAvailable: raw.passwordAvailable ?? DEFAULT_GLOBALS.passwordAvailable,
      ldapAvailable: raw.ldapAvailable ?? false,
      enableThumbs: raw.enableThumbs ?? DEFAULT_GLOBALS.enableThumbs,
      minSearchLength: raw.minSearchLength || DEFAULT_GLOBALS.minSearchLength,
      passwordMinLength: raw.passwordMinLength || DEFAULT_GLOBALS.passwordMinLength,
      mediaAvailable: raw.mediaAvailable ?? false,
      proxyAvailable: raw.proxyAvailable ?? false,
    };
  } catch {
    return DEFAULT_GLOBALS;
  }
}

/**
 * Confirms a FileBrowser backend answers at `baseUrl`, then reads its public settings. Throws
 * GatewayError when a sign-in gateway answers instead.
 */
export async function probeServer(baseUrl: string): Promise<ServerInfo> {
  let body: { message?: string };
  try {
    const res = await request('health', { baseUrl, auth: false, timeoutMs: 10_000 });
    body = (await res.json()) as { message?: string };
  } catch (e) {
    if (e instanceof NetworkError) throw e;
    if (e instanceof ApiError || e instanceof SyntaxError) throw new NotFilebrowserError();
    throw e;
  }
  if (body.message !== 'ok') throw new NotFilebrowserError();

  return { baseUrl, ...(await fetchGlobals(baseUrl)) };
}

/** The app targets v2.0.x; anything else gets a non-blocking warning. */
export function isSupportedVersion(version: string): boolean {
  if (!version) return true;
  return /^v?2\.0\./.test(version);
}
