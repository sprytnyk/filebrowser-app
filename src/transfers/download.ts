import { Directory, File, Paths } from 'expo-file-system';

import { GatewayError, request } from '@/api/client';
import { archiveUrl, rawUrl } from '@/api/resources';
import { type FileItem } from '@/api/types';
import i18n from '@/i18n';
import { errorMessage, toast } from '@/lib/notify';
import { baseName, parentDir } from '@/lib/url';
import { withLockSuspended } from '@/lock/lock-state';
import { announceTransfers } from '@/transfers/announce';
import { getPrefs, setPrefs } from '@/session/prefs';
import {
  addTransfer,
  createQueue,
  getTransfer,
  setRestart,
  transferCredentials,
  updateTransfer,
} from '@/transfers/store';

const enqueue = createQueue(2);

/** The SAF folder the user granted once; asks again if it is gone or `forcePick` is set. */
export async function ensureDownloadDir(forcePick = false): Promise<Directory | null> {
  const saved = getPrefs().downloadDirUri;
  if (saved && !forcePick) {
    try {
      const dir = new Directory(saved);
      if (dir.exists) return dir;
    } catch {
      // Permission revoked or folder deleted; pick again.
    }
  }
  try {
    const dir = await withLockSuspended(() => Directory.pickDirectoryAsync(saved ?? undefined));
    setPrefs({ downloadDirUri: dir.uri });
    return dir;
  } catch {
    return null;
  }
}

export function downloadDirLabel(uri: string | null): string | null {
  if (!uri) return null;
  // content://…/tree/primary%3ADownload%2FFileBrowser → Download/FileBrowser
  const tree = decodeURIComponent(uri.split('/tree/')[1] ?? uri);
  return tree.replace(/^[^:]*:/, '') || tree;
}

function scratchDir(id: string): Directory {
  const dir = new Directory(Paths.cache, 'downloads', id);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Behind a sign-in gateway, a download without its session would save the gateway's login page
 * as the file. Check the session (fetch shares it) and that the cookie can be passed on first.
 */
async function checkGateway(creds: ReturnType<typeof transferCredentials>) {
  if (!creds.gateway) return;
  if (!creds.headers.Cookie) throw new GatewayError();
  await request('health', { baseUrl: creds.baseUrl, auth: false });
}

/** Streams a URL into the app cache with progress; null when cancelled. */
async function fetchToCache(id: string, url: string, name: string): Promise<File | null> {
  const creds = transferCredentials(id);
  await checkGateway(creds);
  const dest = new File(scratchDir(id), name);
  const task = File.createDownloadTask(url, dest, {
    headers: creds.headers,
    onProgress: ({ bytesWritten, totalBytes }) => {
      updateTransfer(id, { loaded: bytesWritten, total: totalBytes > 0 ? totalBytes : 0 });
    },
  });
  updateTransfer(id, { status: 'active', cancel: () => task.cancel() });
  return task.downloadAsync();
}

/**
 * Saves files to the granted device folder. One file downloads as-is; several items or any
 * folder download as one zip, like the web UI.
 */
export async function downloadItems(items: FileItem[]): Promise<void> {
  if (items.length === 0) return;
  const dir = await ensureDownloadDir();
  if (!dir) return;

  const single = items.length === 1 && !items[0].isDir ? items[0] : null;
  const source = items[0].source;
  const name = single
    ? single.name
    : `${items.length === 1 ? items[0].name : baseName(parentDir(items[0].path)) || source}.zip`;
  const url = single
    ? rawUrl(single)
    : archiveUrl(
        source,
        items.map((i) => i.path),
      );

  const id = addTransfer({
    kind: 'download',
    name,
    from: single
      ? `${source}:${single.path}`
      : `${source}:${items.length === 1 ? items[0].path : parentDir(items[0].path)}`,
    target: downloadDirLabel(dir.uri) ?? '',
    total: single ? single.size : 0,
  });

  const job = async () => {
    if (getTransfer(id)?.status === 'cancelled') return;
    const work = scratchDir(id);
    try {
      const file = await fetchToCache(id, url, name);
      if (!file || getTransfer(id)?.status === 'cancelled') return;
      // SAF picks a free name ("name (1).ext") if one already exists.
      await file.copy(dir);
      const size = file.size ?? 0;
      updateTransfer(id, { status: 'done', loaded: size, total: size });
      toast(i18n.t('mobile.downloaded', { name }));
    } catch (e) {
      if (getTransfer(id)?.status !== 'cancelled') {
        updateTransfer(id, { status: 'error', error: errorMessage(e) });
      }
    } finally {
      try {
        work.delete();
      } catch {
        // Already gone.
      }
    }
  };
  setRestart(id, () => enqueue(job));
  enqueue(job);
  announceTransfers(1);
}

/** Fetches one file into the cache (for "Open with"), tracked like other downloads. */
export async function downloadForOpen(item: FileItem): Promise<File | null> {
  const id = addTransfer({
    kind: 'download',
    name: item.name,
    from: `${item.source}:${item.path}`,
    target: '',
    total: item.size,
  });
  try {
    const file = await fetchToCache(id, rawUrl(item), item.name);
    if (file) updateTransfer(id, { status: 'done', loaded: item.size, total: item.size });
    return file;
  } catch (e) {
    updateTransfer(id, { status: 'error', error: errorMessage(e) });
    throw e;
  }
}

/** Drops cached files from earlier "Open with" runs; call once at startup. */
export function clearDownloadScratch() {
  try {
    const dir = new Directory(Paths.cache, 'downloads');
    if (dir.exists) dir.delete();
  } catch {
    // Nothing to clean.
  }
}
