import * as LocalAuthentication from 'expo-local-authentication';
import { useSyncExternalStore } from 'react';

import { getPrefs } from '@/session/prefs';
import { readJson, StorageKeys, writeJson } from '@/session/storage';

/**
 * Screen-lock state. The app re-locks after spending `lockGraceSeconds` in the background,
 * except while it is waiting on a system screen it opened itself (file picker, "Open with",
 * share sheet): those count as foreground work.
 */
// When the app last went to the background. Persisted so that a fresh start (the system
// killing the app, a swipe from recents, a dev reload) honors the timeout too.
let backgroundedAt: number | null = readJson<number>(StorageKeys.lockBackgroundedAt);
let locked = getPrefs().lockEnabled && graceExpired(backgroundedAt);
let suspended = 0;
const listeners = new Set<() => void>();

/** No timestamp means the app never went to the background cleanly: lock to be safe. */
function graceExpired(since: number | null): boolean {
  if (since === null) return true;
  return Date.now() - since >= getPrefs().lockGraceSeconds * 1000;
}

function emit() {
  listeners.forEach((l) => l());
}

export function isLocked() {
  return locked;
}

export function setLocked(next: boolean) {
  if (locked === next) return;
  locked = next;
  emit();
}

export function noteBackground() {
  if (suspended > 0 || locked) return;
  backgroundedAt = Date.now();
  writeJson(StorageKeys.lockBackgroundedAt, backgroundedAt);
}

export function noteForeground() {
  const since = backgroundedAt;
  backgroundedAt = null;
  writeJson(StorageKeys.lockBackgroundedAt, null);
  if (!getPrefs().lockEnabled || since === null || suspended > 0) return;
  if (graceExpired(since)) setLocked(true);
}

/** Runs `fn` (which leaves the app for a system UI) without triggering the lock. */
export async function withLockSuspended<T>(fn: () => Promise<T>): Promise<T> {
  suspended += 1;
  try {
    return await fn();
  } finally {
    // Let the AppState "active" event land before re-arming.
    setTimeout(() => {
      suspended -= 1;
    }, 1000);
  }
}

export function useLocked() {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, isLocked);
}

/** True when the device has a fingerprint/face or at least a PIN, pattern or password. */
export async function canUseScreenLock(): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

export async function authenticate(prompt: string, cancelLabel: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    cancelLabel,
    // Device PIN/pattern/password is the fallback when biometrics fail or aren't set up.
    disableDeviceFallback: false,
  });
  return result.success;
}
