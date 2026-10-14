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
  /** Batch it counts toward in the overall progress (see batchProgress). */
  batch: number;
  /** What it added to its batch's settled totals when it finished. */
  settled?: { loaded: number; total: number };
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

/**
 * Transfers started while others were still running form one batch, so the overall
 * progress keeps counting files that finished instead of jumping back as they leave the
 * running list. A new batch starts once everything has settled.
 */
let batch = { id: 0, loaded: 0, total: 0 };

function joinBatch(): number {
  if (!transfers.some(isRunning)) batch = { id: batch.id + 1, loaded: 0, total: 0 };
  return batch.id;
}

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
  const batchId = joinBatch();
  transfers.push({
    ...t,
    id,
    batch: batchId,
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
    if (isRunning(prev) && next.batch === batch.id) {
      // Done counts in full; a failed or cancelled one stops holding the bar back.
      const loaded = patch.status === 'done' ? next.total || next.loaded : next.loaded;
      next.settled = { loaded, total: patch.status === 'done' ? loaded : next.loaded };
      batch.loaded += next.settled.loaded;
      batch.total += next.settled.total;
    }
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
  if (t.batch === batch.id && t.settled) {
    batch.loaded -= t.settled.loaded;
    batch.total -= t.settled.total;
  }
  updateTransfer(id, {
    batch: joinBatch(),
    settled: undefined,
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

/**
 * Overall progress of the current batch: what has settled plus what's still running.
 * `total` is 0 while any running transfer's size is unknown (zip archives).
 */
export function batchProgress(running: readonly Transfer[]) {
  let loaded = batch.loaded;
  let total = batch.total;
  let known = true;
  for (const x of running) {
    loaded += x.loaded;
    total += x.total;
    if (x.total <= 0) known = false;
  }
  return { loaded, total: known ? total : 0 };
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
