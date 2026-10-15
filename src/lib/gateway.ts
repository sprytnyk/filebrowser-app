import { requireOptionalNativeModule } from 'expo';
import { router } from 'expo-router';

/**
 * Servers behind a sign-in gateway (Authelia, Authentik and the like, via forward auth) only
 * answer requests that carry the gateway's session cookie. React Native's fetch shares the
 * WebView cookie store, so API calls just work after signing in on the gateway's own page.
 * Thumbnails, media and transfers use other HTTP clients and need the cookie as a header, which
 * only the app's native module can read (the cookie is HttpOnly). Expo Go lacks that module, so
 * there those requests go out without it.
 */
type GatewayCookiesModule = { getCookie(url: string): string | null };

const native = requireOptionalNativeModule<GatewayCookiesModule>('GatewayCookies');

/** `{ Cookie }` for requests outside fetch to a gateway-protected server. */
export function gatewayHeaders(baseUrl: string): Record<string, string> {
  try {
    const cookie = native?.getCookie(baseUrl);
    return cookie ? { Cookie: cookie } : {};
  } catch {
    return {};
  }
}

/**
 * True when a response came from the gateway rather than the backend: it was redirected away from
 * the API (to a login page), or the gateway refused it outright with a non-JSON 401. The backend
 * itself always answers API errors as JSON.
 */
export function isGatewayResponse(res: Response, baseUrl: string): boolean {
  const type = res.headers.get('content-type') ?? '';
  if (res.url) {
    if (!res.url.startsWith(`${baseUrl}/api/`)) return true;
  } else if (res.ok && type.includes('text/html')) {
    return true;
  }
  return res.status === 401 && !type.includes('application/json');
}

/** Same check for upload results, which only expose status and headers. */
export function isGatewayUploadResult(status: number, headers: Record<string, string>): boolean {
  const type = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  return type.includes('text/html') || (status === 401 && !type.includes('application/json'));
}

let pending: ((ok: boolean) => void) | null = null;

/**
 * Opens the gateway's sign-in page for `baseUrl`; resolves true once requests get through again,
 * false if the user backs out. Only one sign-in page is open at a time.
 */
export function openGatewaySignIn(baseUrl: string): Promise<boolean> {
  if (pending) return Promise.resolve(false);
  return new Promise((resolve) => {
    pending = resolve;
    router.push({ pathname: '/gateway', params: { url: baseUrl } });
  });
}

export function gatewaySignInOpen(): boolean {
  return pending !== null;
}

/** Called by the gateway screen when it closes. */
export function finishGatewaySignIn(ok: boolean) {
  const resolve = pending;
  pending = null;
  resolve?.(ok);
}

/** Shows the gateway's sign-out page so its session ends too; closes with a Done button. */
export function openGatewaySignOut(logoutUrl: string) {
  router.push({ pathname: '/gateway', params: { url: logoutUrl, mode: 'signout' } });
}
