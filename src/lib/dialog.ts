import { useSyncExternalStore } from 'react';

export type DialogButton = {
  id: string;
  label: string;
  kind?: 'default' | 'cancel' | 'destructive';
};

export type DialogRequest = {
  title: string;
  message?: string;
  buttons: DialogButton[];
};

type Pending = DialogRequest & { key: number; resolve: (id: string | null) => void };

/**
 * Themed replacement for Alert.alert (the native dialog stays white in Expo Go's dark mode).
 * Requests queue up; <DialogHost /> shows them one at a time.
 */
let queue: Pending[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  queue = [...queue];
  listeners.forEach((l) => l());
}

/** Resolves with the pressed button's id, or null when dismissed (back button, tap outside). */
export function ask(request: DialogRequest): Promise<string | null> {
  return new Promise((resolve) => {
    counter += 1;
    queue.push({ ...request, key: counter, resolve });
    emit();
  });
}

export function settle(key: number, id: string | null) {
  const item = queue.find((d) => d.key === key);
  if (!item) return;
  queue = queue.filter((d) => d.key !== key);
  emit();
  item.resolve(id);
}

export function useCurrentDialog(): Pending | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => queue[0] ?? null,
  );
}
