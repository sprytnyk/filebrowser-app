import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fileChecksum } from '@/api/resources';
import { type FileItem } from '@/api/types';

type Version = Pick<FileItem, 'size' | 'modified'>;

const keyFor = (item: (Pick<FileItem, 'source' | 'path'> & Version) | null) => [
  'sha256',
  item?.source,
  item?.path,
  item?.modified,
  item?.size,
];

/** Go sends nanoseconds; keep milliseconds so Date.parse accepts it. */
const parseTime = (modified: string) => Date.parse(modified.replace(/(\.\d{3})\d+/, '$1'));

function sameVersion(a: Version, b: Version) {
  return a.size === b.size && parseTime(a.modified) === parseTime(b.modified);
}

/**
 * SHA-256 of a file, computed by the server when `calculate()` is called. It reads the whole
 * file, so nothing runs on its own. The result is kept per version of the file, so it shows
 * again when the info sheet is reopened.
 *
 * The server hashes the file as it is now, which can be newer than the listing `item` came
 * from. `hashed` is the version it read, and `changed` says it differs from `item`.
 */
export function useSha256(item: FileItem | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keyFor(item),
    queryFn: async () => {
      const result = await fileChecksum(item!, 'sha256');
      if (!sameVersion(result, item!)) {
        // Also keep it for the version that was hashed, which the refreshed list will show.
        queryClient.setQueryData(keyFor({ ...item!, ...result }), result);
        void queryClient.invalidateQueries({ queryKey: ['listing', item!.source] });
        void queryClient.invalidateQueries({ queryKey: ['search', item!.source] });
      }
      return result;
    },
    enabled: false,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
  const hashed = query.data ?? null;
  return {
    value: hashed?.value ?? null,
    hashed,
    changed: hashed !== null && item !== null && !sameVersion(hashed, item),
    calculating: query.isFetching,
    error: query.error,
    calculate: () => void query.refetch(),
  };
}
