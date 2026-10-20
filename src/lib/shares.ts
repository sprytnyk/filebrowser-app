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
 * The server stores and returns share paths with the owner's scope in front (alice's
 * `/photos/cat.jpg` comes back as `/users/alice/photos/cat.jpg`), while listings and routes use
 * paths inside the scope. Strips the signed-in user's scope so the two compare; links outside it
 * (other users' shares, listed for admins) keep their full path.
 */
export function withScopedPaths(
  shares: ShareLink[],
  scopes: readonly { name: string; scope: string }[],
): ShareLink[] {
  return shares.map((share) => {
    const scope = stripSlash(scopes.find((s) => s.name === share.source)?.scope ?? '/');
    if (scope === '/' || scope === '') return share;
    const path = stripSlash(share.path);
    if (path === scope) return { ...share, path: '/' };
    return path.startsWith(`${scope}/`)
      ? { ...share, path: share.path.slice(scope.length) }
      : share;
  });
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
  const label = expiryDate(share);
  return share.expire * 1000 < now
    ? `${t('general.expiration')}: ${label}`
    : `${t('general.expires')} ${label}`;
}

export function createdDate(share: ShareLink) {
  return share.createdAt ? dateTime(share.createdAt) : null;
}

export function expiryDate(share: ShareLink) {
  return dateTime(share.expire);
}

function dateTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleString(formatLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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

/** Within a day of expiring, so worth flagging. */
export function expiresSoon(share: ShareLink, now: number) {
  return share.expire > 0 && !isExpired(share, now) && share.expire * 1000 - now < 86_400_000;
}

/**
 * Newest first for links whose creation date is known (see `useShares`), then the rest by
 * expiry, then expired links. The server lists shares in Go map order, which changes on every
 * request past 8 links, so this has to be a total order to keep the list still on refresh.
 */
export function byCreated(shares: ShareLink[], now: number) {
  const rank = (s: ShareLink) => (isExpired(s, now) ? 2 : s.createdAt ? 0 : 1);
  const expiryOrder = new Map(byExpiry(shares, now).map((s, i) => [s.hash, i]));
  return [...shares].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.createdSeq ?? 0) - (a.createdSeq ?? 0) ||
      expiryOrder.get(a.hash)! - expiryOrder.get(b.hash)!,
  );
}

/**
 * Soonest expiry first, permanent links after those, already expired ones last (most recently
 * expired first). Ties go by name and then hash.
 */
export function byExpiry(shares: ShareLink[], now: number) {
  const rank = (s: ShareLink) => (isExpired(s, now) ? 2 : s.expire ? 0 : 1);
  return [...shares].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 2 ? b.expire - a.expire : a.expire - b.expire) ||
      shareName(a).localeCompare(shareName(b)) ||
      a.hash.localeCompare(b.hash),
  );
}
