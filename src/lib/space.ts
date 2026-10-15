import { type QueryClient } from '@tanstack/react-query';

import { type SourceInfo } from '@/api/types';

/** Storage counts as almost full once less than this share of its disk is free. */
const LOW_SPACE_RATIO = 0.1;

/**
 * Free bytes on the source's disk, or null when the server doesn't report it. The server
 * gives disk used as total minus available (like df), so this is df's "Avail".
 */
export function sourceFree(source: SourceInfo): number | null {
  const usedAlt = source.usedAlt ?? 0;
  return source.total > 0 && usedAlt > 0 ? Math.max(0, source.total - usedAlt) : null;
}

export function isLowSpace(source: SourceInfo): boolean {
  const free = sourceFree(source);
  return free !== null && free < source.total * LOW_SPACE_RATIO;
}

/**
 * Counts `delta` bytes taken (or, negative, freed) on `source` in the cached sources right
 * away: the server's own figure lags by up to 30 s, and useInvalidateListing refetches it
 * once it's current.
 */
export function adjustUsage(queryClient: QueryClient, source: string, delta: number) {
  queryClient.setQueryData<SourceInfo[]>(['sources'], (old) =>
    old?.map((s) =>
      s.name === source && sourceFree(s) !== null
        ? // Stays above 0, which would read as "not reported".
          { ...s, usedAlt: Math.min(s.total, Math.max(1, s.usedAlt! + delta)) }
        : s,
    ),
  );
}
