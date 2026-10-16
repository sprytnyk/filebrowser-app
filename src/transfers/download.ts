import { Directory, DownloadTask, File, Paths, type DownloadProgress } from 'expo-file-system';

import { ApiError, GatewayError, NetworkError, request } from '@/api/client';
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
/** Waits before each retry of a download that failed on the network or at a gateway. */
const RETRY_DELAYS = [2000, 5000, 10000];
const GATEWAY_ERRORS = [502, 503, 504];

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

/** `name`, or "name (1).ext", "name (2).ext", … if the folder already has it. */
function freeName(dir: Directory, name: string): string {
  const taken = new Set(dir.list().map((entry) => entry.name));
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let n = 1; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
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

/**
 * The native task rejects with "Call to function 'FileSystemDownloadTask.start' has been
 * rejected. → Caused by: Unable to download a file: <cause>". Returns a NetworkError for a
 * dropped connection or timeout ("Software caused connection abort"), an ApiError for an HTTP
 * status, and anything else unchanged.
 */
function downloadError(e: unknown): unknown {
  const raw = e instanceof Error ? e.message : String(e);
  const cause = raw.split('Unable to download a file:')[1]?.trim();
  if (!cause) return e;
  const http = /^HTTP (\d+)$/.exec(cause);
  if (http) return new ApiError(cause, Number(http[1]));
  return new NetworkError(cause, /timed? ?out/i.test(cause));
}

function isRetryable(e: unknown) {
  return e instanceof NetworkError || (e instanceof ApiError && GATEWAY_ERRORS.includes(e.status));
}

/** Keeps the cause ("Software caused connection abort") under the generic message. */
function failureMessage(e: unknown) {
  return errorMessage(e) + (e instanceof NetworkError && e.message ? `\n${e.message}` : '');
}

const sizeOf = (file: File) => (file.exists ? (file.size ?? 0) : 0);

/**
 * A listing's `modified` as an HTTP date for If-Range, or null if it doesn't parse. The server
 * compares whole seconds with the file's mtime and sends the full file when they differ.
 */
function ifRangeDate(modified: string): string | null {
  // Go sends nanoseconds; keep milliseconds so Date.parse accepts it.
  const ms = Date.parse(modified.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(ms) ? null : new Date(ms).toUTCString();
}

/**
 * Streams a URL into the app cache with progress; null when cancelled. Network and gateway
 * failures are retried a few times, like upload chunks; the delays start over whenever an
 * attempt got further than any before, so a big file on a flaky link keeps going.
 *
 * With `ifRange` (single files), a retry resumes from the bytes already in the cache, also
 * those left by an earlier failed run of this transfer. The server's ServeContent honours
 * Range, and If-Range makes it send the whole file instead if it changed since the listing
 * (the native task then starts over). Zips always start over: a Range request makes the
 * server build a fresh archive to a temp file before sending anything.
 */
async function fetchToCache(
  id: string,
  url: string,
  name: string,
  ifRange: string | null,
): Promise<File | null> {
  const dest = new File(scratchDir(id), name);
  let total = getTransfer(id)?.total ?? 0;
  let best = ifRange ? sizeOf(dest) : 0;
  let failures = 0;
  for (;;) {
    const creds = transferCredentials(id);
    await checkGateway(creds);
    const offset = ifRange ? sizeOf(dest) : 0;
    // The connection dropped after the last byte arrived; a Range past the end would get 416.
    if (offset > 0 && offset === total) return dest;
    const options = {
      headers: offset > 0 ? { ...creds.headers, 'If-Range': ifRange! } : creds.headers,
      onProgress: ({ bytesWritten, totalBytes }: DownloadProgress) => {
        if (totalBytes > 0) total = totalBytes;
        updateTransfer(id, { loaded: bytesWritten, total });
      },
    };
    const task =
      offset > 0
        ? DownloadTask.fromSavable(
            { url, fileUri: dest.uri, isDirectory: false, resumeData: String(offset) },
            options,
          )
        : File.createDownloadTask(url, dest, options);
    // Start from the resumed bytes, so a Retry doesn't count them toward the rate.
    updateTransfer(id, { status: 'active', loaded: offset, cancel: () => task.cancel() });
    try {
      return await (offset > 0 ? task.resumeAsync() : task.downloadAsync());
    } catch (e) {
      if (getTransfer(id)?.status === 'cancelled') return null;
      const error = downloadError(e);
      const reached = sizeOf(dest);
      if (reached > best) {
        best = reached;
        failures = 0;
      }
      if (!isRetryable(error) || failures >= RETRY_DELAYS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[failures++]));
      if (getTransfer(id)?.status === 'cancelled') return null;
    }
  }
}

function deleteScratch(id: string) {
  try {
    new Directory(Paths.cache, 'downloads', id).delete();
  } catch {
    // Already gone.
  }
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
  const ifRange = single ? ifRangeDate(single.modified) : null;

  const job = async () => {
    if (getTransfer(id)?.status === 'cancelled') return;
    try {
      const file = await fetchToCache(id, url, name, ifRange);
      if (!file || getTransfer(id)?.status === 'cancelled') return;
      // copy() rejects when the folder already has this name, so save under a free one.
      const saved = freeName(dir, name);
      if (saved !== name) file.rename(saved);
      await file.copy(dir);
      const size = file.size ?? 0;
      updateTransfer(id, { status: 'done', loaded: size, total: size });
      toast(i18n.t('mobile.downloaded', { name: saved }));
    } catch (e) {
      if (getTransfer(id)?.status !== 'cancelled') {
        updateTransfer(id, { status: 'error', error: failureMessage(e) });
      }
    } finally {
      // Keep a failed file's partial download so Retry resumes it; discard drops it when the
      // transfer is cleared from the list.
      if (!ifRange || getTransfer(id)?.status !== 'error') deleteScratch(id);
    }
  };
  updateTransfer(id, { discard: () => deleteScratch(id) });
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
    const file = await fetchToCache(id, rawUrl(item), item.name, ifRangeDate(item.modified));
    if (file) updateTransfer(id, { status: 'done', loaded: item.size, total: item.size });
    else deleteScratch(id);
    return file;
  } catch (e) {
    deleteScratch(id);
    updateTransfer(id, { status: 'error', error: failureMessage(e) });
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
