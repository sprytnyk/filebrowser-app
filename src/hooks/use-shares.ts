import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { listShares, shareCreationTimes } from '@/api/share';
import { type ShareLink } from '@/api/types';
import { withScopedPaths } from '@/lib/shares';
import { useSelf } from '@/session/session';

/**
 * The user's share links, with paths inside their scope like the rest of the app and
 * `createdAt` filled in from the activity log where it has one. The cache keeps the server's
 * shape, so `setQueryData(['shares'], …)` takes a link as the API returns it. Invalidating
 * `['shares']` refreshes the creation times too.
 */
export function useShares(options: { refetchOnMount?: boolean | 'always' } = {}) {
  const { data: self } = useSelf();
  const enabled = !!self?.permissions.share;
  const created = useQuery({
    queryKey: ['shares', 'created'],
    queryFn: shareCreationTimes,
    enabled,
    ...options,
  });
  const scopes = self?.scopes;
  const times = created.data;
  const select = useCallback(
    (shares: ShareLink[]) =>
      withScopedPaths(shares, scopes ?? []).map((s) =>
        times?.has(s.hash) ? { ...s, ...times.get(s.hash) } : s,
      ),
    [scopes, times],
  );
  const shares = useQuery({
    queryKey: ['shares'],
    queryFn: listShares,
    enabled,
    select,
    ...options,
  });
  const { refetch: refetchShares } = shares;
  const { refetch: refetchCreated } = created;
  const refetch = useCallback(
    (opts?: { cancelRefetch?: boolean }) =>
      Promise.all([refetchShares(opts), refetchCreated(opts)]),
    [refetchShares, refetchCreated],
  );
  return { ...shares, refetch };
}
