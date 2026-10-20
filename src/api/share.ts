import { request, requestJson } from '@/api/client';
import { type ShareLink } from '@/api/types';

export type ShareUnit = 'minutes' | 'hours' | 'days';

export type NewShare = {
  source: string;
  path: string;
  /** Empty for a permanent share. */
  expires: string;
  unit: ShareUnit;
  password: string;
};

export function createShare(share: NewShare): Promise<ShareLink> {
  return requestJson<ShareLink>('share', {
    method: 'POST',
    json: {
      source: share.source,
      path: share.path,
      expires: share.expires,
      unit: share.unit,
      ...(share.password ? { password: share.password } : {}),
    },
  });
}

export function listShares(): Promise<ShareLink[]> {
  return requestJson<ShareLink[]>('share/list');
}

type ActivityPage = {
  items: { id: number; shareHash?: string; createdAt: number }[];
  totalPages: number;
};

/**
 * When each share was made, by hash. The share API has no creation date, but the activity log
 * records a `shareCreate` event per link (admins see everyone's, others their own). It keeps
 * 30 days by default and can be turned off, so older links are missing; on any error this
 * resolves empty and the caller falls back to other ordering.
 */
export type ShareCreated = Required<Pick<ShareLink, 'createdAt' | 'createdSeq'>>;

export async function shareCreationTimes(): Promise<Map<string, ShareCreated>> {
  const times = new Map<string, ShareCreated>();
  try {
    // 500 per page is the server's maximum; ten pages is plenty for a phone list.
    for (let page = 1; page <= 10; page++) {
      const res = await requestJson<ActivityPage>('tools/activity', {
        params: { eventType: 'shareCreate', from: 0, limit: 500, page },
      });
      for (const item of res.items) {
        if (item.shareHash) {
          times.set(item.shareHash, { createdAt: item.createdAt, createdSeq: item.id });
        }
      }
      if (page >= res.totalPages) break;
    }
  } catch {
    // Older servers have no activity log; ordering then falls back to expiry.
  }
  return times;
}

export async function deleteShare(hash: string): Promise<void> {
  await request('share', { method: 'DELETE', params: { hash } });
}
