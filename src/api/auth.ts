import { ApiError, request } from '@/api/client';

export type LoginFailure =
  | 'invalidCredentials'
  | 'otpRequired'
  | 'otpNotConfigured'
  | 'passkeyRequired'
  | 'passwordChangeRequired'
  | 'other';

/** Login failures are told apart by the backend's error text (backend/internal/errors). */
export function classifyLoginError(e: unknown): LoginFailure {
  if (!(e instanceof ApiError)) return 'other';
  const msg = e.message.toLowerCase();
  if (msg.includes('otp code is required')) return 'otpRequired';
  if (msg.includes('otp is enforced')) return 'otpNotConfigured';
  if (msg.includes('passkey mfa is required')) return 'passkeyRequired';
  if (msg.includes('password change is required')) return 'passwordChangeRequired';
  if (e.status === 401 || e.status === 403) return 'invalidCredentials';
  return 'other';
}

type Credentials = { baseUrl: string; username: string; password: string; otp?: string };

/** POST /api/auth/login; the JWT comes back as a text/plain body. */
export async function login({ baseUrl, username, password, otp }: Credentials): Promise<string> {
  const res = await request('auth/login', {
    method: 'POST',
    baseUrl,
    auth: false,
    params: { username },
    headers: {
      'X-Password': encodeURIComponent(password),
      'X-Secret': otp ?? '',
    },
  });
  return (await res.text()).trim();
}

/** For accounts flagged "require password change"; answers with a session token like login. */
export async function changeRequiredPassword(
  creds: Credentials & { newPassword: string },
): Promise<string> {
  const res = await request('auth/password/change-required', {
    method: 'POST',
    baseUrl: creds.baseUrl,
    auth: false,
    params: { username: creds.username },
    headers: {
      'X-Password': encodeURIComponent(creds.password),
      'X-Secret': creds.otp ?? '',
    },
    json: { password: creds.newPassword, passwordConfirm: creds.newPassword },
  });
  return (await res.text()).trim();
}

/** A server other than the active one, e.g. a background profile. */
type Target = { baseUrl: string; headers: Record<string, string> };

function targetOptions(target?: Target) {
  return target ? { baseUrl: target.baseUrl, headers: target.headers, auth: false } : {};
}

/** Rotates the session token; the old one stops working. */
export async function renew(target?: Target): Promise<string> {
  const res = await request('auth/renew', { method: 'POST', ...targetOptions(target) });
  return (await res.text()).trim();
}

/** Revokes a token server-side. Errors are ignored: the app forgets the token anyway. */
export async function logout(target?: Target): Promise<void> {
  try {
    await request('auth/logout', { method: 'POST', timeoutMs: 5_000, ...targetOptions(target) });
  } catch {
    // Offline or already expired.
  }
}
