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

export async function deleteShare(hash: string): Promise<void> {
  await request('share', { method: 'DELETE', params: { hash } });
}
