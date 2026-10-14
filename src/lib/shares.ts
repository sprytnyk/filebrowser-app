import { type TFunction } from 'i18next';

import { type ShareLink } from '@/api/types';
import { formatLocale } from '@/i18n';

/**
 * Share paths come back with or without a trailing slash (moved items keep one), so compare
 * them without it.
 */
function stripSlash(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function samePath(a: string, b: string) {
  return stripSlash(a) === stripSlash(b);
}

/**
 * Links that point at one item. Admins list everyone's shares, so keep the user's own plus
 * `alsoHashes` (e.g. a link just created), like upstream's per-item view.
 */
export function sharesForItem(
  shares: ShareLink[],
  item: { source: string; path: string },
  username: string | undefined,
  alsoHashes: readonly (string | null | undefined)[] = [],
): ShareLink[] {
  return shares.filter(
    (s) =>
      s.source === item.source &&
      samePath(s.path, item.path) &&
      (s.username === username || alsoHashes.includes(s.hash)),
  );
}

/** "source:/path" keys of the items the user has shared, for marking them in listings. */
export function sharedKeys(shares: ShareLink[], username: string | undefined): Set<string> {
  return new Set(shares.filter((s) => s.username === username).map(itemKey));
}

export function itemKey(item: { source: string; path: string }) {
  return `${item.source}:${stripSlash(item.path)}`;
}

/** "Expires …" / "Expiration: …" (already past) / "Permanent". `now` keeps rendering pure. */
export function expiryText(share: ShareLink, t: TFunction, now: number) {
  if (!share.expire) return t('general.permanent');
  const date = new Date(share.expire * 1000);
  const label = date.toLocaleString(formatLocale(), { dateStyle: 'medium', timeStyle: 'short' });
  return date.getTime() < now
    ? `${t('general.expiration')}: ${label}`
    : `${t('general.expires')} ${label}`;
}

export function shareName(share: ShareLink) {
  return share.path.split('/').filter(Boolean).pop() ?? share.source;
}

export function isExpired(share: ShareLink, now: number) {
  return share.expire > 0 && share.expire * 1000 < now;
}

/**
 * The list doesn't say whether a share has a password, but a protected share's download link
 * points at the share page (`/public/share/<hash>?download=true`) so the password can be asked
 * for, instead of the direct `/public/api/resources/download` endpoint.
 */
export function hasPassword(share: ShareLink) {
  return /\/public\/share\/[^/?]+\?(.*&)?download=true/.test(share.downloadURL);
}

/** Active shares first, expired ones at the end; otherwise keeps the server's order. */
export function activeFirst(shares: ShareLink[], now: number) {
  return [...shares].sort((a, b) => Number(isExpired(a, now)) - Number(isExpired(b, now)));
}
