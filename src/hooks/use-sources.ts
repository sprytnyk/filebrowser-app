import { useQuery } from '@tanstack/react-query';

import { getSources } from '@/api/users';
import { useSelf } from '@/session/session';

/** The server's sources, limited to the ones the signed-in user has a scope for. */
export function useSources() {
  const self = useSelf();
  const sources = useQuery({ queryKey: ['sources'], queryFn: getSources });
  const allowed = new Set(self.data?.scopes.map((s) => s.name) ?? []);
  const visible = (sources.data ?? []).filter((s) => allowed.size === 0 || allowed.has(s.name));
  return { sources, self, visible };
}
