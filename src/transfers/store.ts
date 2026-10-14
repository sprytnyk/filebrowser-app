import { useSyncExternalStore } from 'react';

import { activeProfile, credentialsFor, profileName } from '@/session/servers';

export type TransferStatus = 'queued' | 'active' | 'done' | 'error' | 'cancelled';

export type Transfer = {
  id: string;
  kind: 'upload' | 'download';
  name: string;
  /** Where it comes from: "source:/path" for downloads; empty for uploads (this device). */
  from: string;
  /** Where it goes: "source:/dir/" for uploads, the device folder for downloads, "" for Open with. */
  target: string;
  status: TransferStatus;
  loaded: number;
  /** 0 when unknown (zip archives are built on the fly). */
  total: number;
  error?: string;
  /** Epoch ms. */
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** Smoothed transfer rate in bytes per second while active. */
  rate?: number;
  /** Whether retryTransfer() can run it again. */
  retryable: boolean;
  /** Server profile it belongs to; it keeps using that server after a switch. */
  serverId: string;
  /** That server's name when the transfer started, in case the server is removed later. */
  serverLabel: string;
};

type Internal = Transfer & {
  cancel?: () => void;
  restart?: () => void;
  lastSampleAt?: number;
  lastSampleLoaded?: number;
};

const FINISHED: readonly TransferStatus[] = ['done', 'error', 'cancelled'];

export function isRunning(t: Pick<Transfer, 'status'>) {
  return t.status === 'queued' || t.status === 'active';
}

let transfers: Internal[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  transfers = [...transfers];
  listeners.forEach((l) => l());
}

export function addTransfer(
  t: Omit<
    Transfer,
    'id' | 'status' | 'loaded' | 'createdAt' | 'retryable' | 'serverId' | 'serverLabel'
  >,
  restart?: () => void,
): string {
  counter += 1;
  const id = `${Date.now().toString(36)}-${counter}`;
  const profile = activeProfile();
  transfers.push({
    ...t,
    id,
    serverId: profile?.id ?? '',
    serverLabel: profile ? profileName(profile) : '',
    status: 'queued',
    loaded: 0,
    createdAt: Date.now(),
    retryable: !!restart,
    restart,
  });
  emit();
  return id;
}

/** Sets the job that retryTransfer() re-queues (when it isn't known at addTransfer time). */
export function setRestart(id: string, restart: () => void) {
  updateTransfer(id, { restart, retryable: true });
}

export function updateTransfer(id: string, patch: Partial<Internal>) {
  const idx = transfers.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const prev = transfers[idx];
  const next: Internal = { ...prev, ...patch };
  const now = Date.now();
  if (patch.status === 'active' && !prev.startedAt) {
    next.startedAt = now;
    next.lastSampleAt = now;
    next.lastSampleLoaded = next.loaded;
  }
  if (patch.status && FINISHED.includes(patch.status)) {
    next.finishedAt = now;
    next.rate = undefined;
  } else if (patch.loaded !== undefined && next.lastSampleAt !== undefined) {
    // Rate over ~1 s windows, smoothed so the number doesn't jitter.
    const dt = now - next.lastSampleAt;
    if (dt >= 1000) {
      const instant = ((next.loaded - (next.lastSampleLoaded ?? 0)) * 1000) / dt;
      next.rate = prev.rate === undefined ? instant : prev.rate * 0.6 + instant * 0.4;
      next.lastSampleAt = now;
      next.lastSampleLoaded = next.loaded;
    }
  }
  transfers[idx] = next;
  emit();
}

export function getTransfer(id: string): Internal | undefined {
  return transfers.find((t) => t.id === id);
}

/** Base URL and auth header of the server a transfer belongs to (throws once signed out). */
export function transferCredentials(id: string) {
  return credentialsFor(getTransfer(id)?.serverId ?? '');
}

export function cancelTransfer(id: string) {
  const t = getTransfer(id);
  if (!t || !isRunning(t)) return;
  t.cancel?.();
  updateTransfer(id, { status: 'cancelled' });
}

/** Queues a failed or cancelled transfer again from the start. */
export function retryTransfer(id: string) {
  const t = getTransfer(id);
  if (!t?.restart || isRunning(t)) return;
  updateTransfer(id, {
    status: 'queued',
    loaded: 0,
    error: undefined,
    startedAt: undefined,
    finishedAt: undefined,
    rate: undefined,
    lastSampleAt: undefined,
    lastSampleLoaded: undefined,
    cancel: undefined,
  });
  t.restart();
}

export function clearFinished() {
  transfers = transfers.filter(isRunning);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => transfers as readonly Transfer[];

export function useTransfers(): readonly Transfer[] {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Runs async jobs with a concurrency cap, in submission order. */
export function createQueue(limit: number) {
  const waiting: (() => Promise<void>)[] = [];
  let running = 0;
  const next = () => {
    while (running < limit && waiting.length > 0) {
      const job = waiting.shift()!;
      running += 1;
      void job().finally(() => {
        running -= 1;
        next();
      });
    }
  };
  return (job: () => Promise<void>) => {
    waiting.push(job);
    next();
  };
}
