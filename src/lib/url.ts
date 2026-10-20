export type QueryValue = string | number | boolean | null | undefined | readonly string[];

/** Builds a query string the way upstream's getApiPath does: skips empty values, repeats arrays. */
export function buildQuery(params: Record<string, QueryValue> = {}): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    const values = Array.isArray(value) ? value : [String(value)];
    for (const v of values) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/** Whether the user typed a scheme ("https://…"), rather than leaving it to the app. */
export function hasScheme(input: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim());
}

/**
 * Normalizes what the user typed into a server base URL: scheme + host + optional subpath,
 * never ending in "/". Without a scheme it gets `scheme`. Returns null when it isn't a usable
 * http(s) URL.
 */
export function normalizeServerUrl(
  input: string,
  scheme: 'https' | 'http' = 'https',
): string | null {
  let value = input.trim();
  if (value === '') return null;
  if (!hasScheme(value)) {
    value = `${scheme}://${value}`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

export function isPlainHttp(baseUrl: string): boolean {
  return baseUrl.startsWith('http://');
}

export function joinPath(dir: string, name: string): string {
  return `${dir.endsWith('/') ? dir : `${dir}/`}${name}`;
}

export function parentDir(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  if (idx <= 0) return '/';
  return `${trimmed.slice(0, idx)}/`;
}

export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}
