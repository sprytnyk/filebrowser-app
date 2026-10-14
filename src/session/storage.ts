import * as SecureStore from 'expo-secure-store';

/** Small JSON values in the Android keystore-backed SecureStore. */
export function readJson<T>(key: string): T | null {
  try {
    const raw = SecureStore.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown) {
  if (value === null || value === undefined) {
    void SecureStore.deleteItemAsync(key);
  } else {
    SecureStore.setItem(key, JSON.stringify(value));
  }
}

export const StorageKeys = {
  /** Known servers and which one is active. */
  servers: 'fb.servers',
  /** Single-server keys from before multi-server support; migrated on first start. */
  legacyServer: 'fb.server',
  legacyToken: 'fb.token',
  prefs: 'fb.prefs',
  lockBackgroundedAt: 'fb.lock.backgroundedAt',
} as const;

/** Each server's session token sits in its own key. */
export function tokenKey(profileId: string) {
  return `fb.token.${profileId}`;
}
