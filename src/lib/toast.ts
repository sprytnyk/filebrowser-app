import { useSyncExternalStore } from 'react';

export type ToastAction = { label: string; onPress: () => void };

export type ToastMessage = { key: number; message: string; action?: ToastAction };

/**
 * In-app snackbar state (ToastAndroid is an unthemed white bubble with no actions).
 * One message at a time; a new one replaces the current. Screens mount <ToastHost />, and
 * the focused screen's host draws it, so it stays visible above modals and sheets.
 */
let current: ToastMessage | null = null;
let hosts: number[] = [];
let counter = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Shows `message`, or returns false when no screen can draw it. */
export function showToast(message: string, action?: ToastAction): boolean {
  if (hosts.length === 0) return false;
  counter += 1;
  current = { key: counter, message, action };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => dismissToast(), action ? 5000 : 3000);
  emit();
  return true;
}

export function dismissToast(key?: number) {
  if (!current || (key !== undefined && current.key !== key)) return;
  current = null;
  if (timer) clearTimeout(timer);
  timer = null;
  emit();
}

export function newToastHostId() {
  counter += 1;
  return counter;
}

/** Registers a host; the most recently registered one draws. Returns the unregister function. */
export function registerToastHost(id: number) {
  hosts = [...hosts, id];
  emit();
  return () => {
    hosts = hosts.filter((h) => h !== id);
    emit();
  };
}

export function useToast(): { toast: ToastMessage | null; activeHost: number | undefined } {
  const toast = useSyncExternalStore(subscribe, () => current);
  const activeHost = useSyncExternalStore(subscribe, () => hosts[hosts.length - 1]);
  return { toast, activeHost };
}
