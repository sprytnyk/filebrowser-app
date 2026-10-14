import { useSyncExternalStore } from 'react';

import { readJson, StorageKeys, writeJson } from '@/session/storage';

export type SortBy = 'name' | 'size' | 'modified';

export type Prefs = {
  viewMode: 'list' | 'grid';
  sortBy: SortBy;
  sortAsc: boolean;
  /** SAF tree URI granted for downloads. */
  downloadDirUri: string | null;
  lockEnabled: boolean;
  /** Seconds in background before the screen lock re-engages. */
  lockGraceSeconds: number;
};

const DEFAULT_PREFS: Prefs = {
  viewMode: 'list',
  sortBy: 'name',
  sortAsc: true,
  downloadDirUri: null,
  lockEnabled: false,
  lockGraceSeconds: 60,
};

let prefs: Prefs = { ...DEFAULT_PREFS, ...readJson<Partial<Prefs>>(StorageKeys.prefs) };
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return prefs;
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  writeJson(StorageKeys.prefs, prefs);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs);
}
