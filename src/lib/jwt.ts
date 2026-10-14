type Claims = { exp?: number; iat?: number };

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

/** Reads exp/iat from a JWT without verifying it; the server stays the authority. */
export function readJwtClaims(token: string): Claims {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    const claims = JSON.parse(decodeBase64Url(payload)) as Claims;
    return { exp: claims.exp, iat: claims.iat };
  } catch {
    return {};
  }
}

/** True once more than half of the token's lifetime has passed. */
export function shouldRenew(token: string, now = Date.now() / 1000): boolean {
  const { exp, iat } = readJwtClaims(token);
  if (!exp) return false;
  const start = iat ?? exp - 2 * 3600;
  return now >= start + (exp - start) / 2;
}

export function isExpired(token: string, now = Date.now() / 1000): boolean {
  const { exp } = readJwtClaims(token);
  return exp !== undefined && now >= exp;
}
