import { request, requestJson } from '@/api/client';
import { type SourceInfo, type User } from '@/api/types';

export function getSelf(): Promise<User> {
  return requestJson<User>('users', { params: { username: 'self' } });
}

/** Changes the signed-in user's password; the backend re-checks the current one via X-Password. */
export async function changePassword(
  username: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await request('users', {
    method: 'PATCH',
    params: { username },
    headers: { 'X-Password': encodeURIComponent(currentPassword) },
    sessionOn401: false,
    json: { which: ['password'], data: { password: newPassword } },
  });
}

export async function getSources(): Promise<SourceInfo[]> {
  const map = await requestJson<Record<string, SourceInfo>>('settings/sources');
  return Object.values(map);
}
