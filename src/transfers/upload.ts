import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, type FileHandle, FileMode, Paths, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { GatewayError, messageFromBody, NetworkError } from '@/api/client';
import { uploadUrl } from '@/api/resources';
import i18n from '@/i18n';
import { isGatewayUploadResult } from '@/lib/gateway';
import { errorMessage } from '@/lib/notify';
import { delay } from '@/lib/transfer-service';
import { joinPath } from '@/lib/url';
import { withLockSuspended } from '@/lock/lock-state';
import { readJson, StorageKeys, writeJson } from '@/session/storage';
import {
  addTransfer,
  createQueue,
  getTransfer,
  setRestart,
  transferCredentials,
  updateTransfer,
} from '@/transfers/store';

export type PickedFile = {
  uri: string;
  name: string;
  size: number;
  mimeType: string | null;
  /** Subfolder under the upload target, without slashes at the ends ("" or "a/b"). */
  relDir?: string;
};

/** A device folder picked for upload: its subfolders (relative paths) and every file in it. */
export type PickedFolder = { name: string; dirs: string[]; files: PickedFile[] };

const MB = 1024 * 1024;
const enqueue = createQueue(2);
/**
 * Waits before each retry of a request that failed on the network or at a gateway: quick at
 * first for brief blips, then backing off to ride out a Wi-Fi reconnect (about a minute).
 */
const RETRY_DELAYS = [500, 1000, 2000, 4000, 8000, 15000, 30000];
const GATEWAY_ERRORS = [502, 503, 504];

export async function pickDocuments(): Promise<PickedFile[]> {
  // Keep the picker's content:// URIs: chunked uploads read them through the content
  // resolver, so large files aren't copied into the cache first (and Expo Go's scoped file
  // access doesn't reject the picker's cache copy).
  const result = await withLockSuspended(() =>
    DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: false }),
  );
  if (result.canceled) return [];
  return result.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    size: a.size ?? new File(a.uri).size ?? 0,
    mimeType: a.mimeType ?? null,
  }));
}

export async function pickMedia(): Promise<PickedFile[]> {
  const result = await withLockSuspended(() =>
    ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1,
      exif: false,
    }),
  );
  if (result.canceled) return [];
  return result.assets.map((a, i) => {
    const name = a.fileName || a.uri.split('/').pop() || `media-${Date.now()}-${i}`;
    return {
      uri: a.uri,
      name,
      size: a.fileSize ?? new File(a.uri).size ?? 0,
      mimeType: a.mimeType ?? null,
    };
  });
}

/**
 * Name of a SAF document from its URI. Only external-storage IDs ("primary:DCIM/a.jpg")
 * carry the path; other providers use opaque IDs, so null there.
 */
function safName(uri: string): string | null {
  if (!uri.startsWith('content://com.android.externalstorage.documents/')) return null;
  const trimmed = uri.replace(/\/+$/, '');
  const encoded = trimmed.split('/document/')[1] ?? trimmed.split('/tree/')[1];
  if (!encoded) return null;
  const id = decodeURIComponent(encoded);
  const path = id.slice(id.indexOf(':') + 1);
  return path.split('/').pop() || null;
}

/**
 * Each folder is one round of native SAF queries; yielding between folders keeps the app
 * responsive and lets the JS engine collect the native handles of big trees as it goes
 * (one synchronous walk over a large folder crashed Hermes).
 */
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function walkFolder(dir: Directory, rel: string, out: PickedFolder) {
  await yieldToEventLoop();
  const entries = dir.list();
  const subdirs: [Directory, string][] = [];
  // Directory.info() lists display names in the same order as list().
  let names: string[] | undefined;
  entries.forEach((entry, i) => {
    let name = safName(entry.uri);
    if (!name) {
      names ??= dir.info().files ?? [];
      name = names[i] ?? `${i}`;
    }
    const path = rel ? `${rel}/${name}` : name;
    if (entry instanceof Directory) {
      out.dirs.push(path);
      subdirs.push([entry, path]);
    } else {
      // Uploads are sent as octet-stream, so skip the extra MIME type query per file.
      out.files.push({ uri: entry.uri, name, size: entry.size ?? 0, mimeType: null, relDir: rel });
    }
  });
  for (const [sub, path] of subdirs) await walkFolder(sub, path, out);
}

/**
 * Lets the user pick a device folder and lists everything in it, subfolders included.
 * `onReading` fires with the folder's name once it's picked, before the (possibly slow) scan.
 */
export async function pickFolder(onReading: (name: string) => void): Promise<PickedFolder | null> {
  let root: Directory;
  try {
    root = await withLockSuspended(() => Directory.pickDirectoryAsync());
  } catch {
    return null;
  }
  const folder: PickedFolder = { name: safName(root.uri) ?? root.name, dirs: [], files: [] };
  onReading(folder.name);
  await walkFolder(root, '', folder);
  return folder;
}

type UploadTarget = { source: string; dir: string; overwrite: boolean; chunkSizeMb: number };

class UploadHttpError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(
      status !== 409
        ? messageFromBody(body, `HTTP ${status}`)
        : // Another chunked upload still holds this path (the server keeps it for 30 min).
          body.includes('upload session')
          ? i18n.t('mobile.uploadSessionConflict')
          : i18n.t('general.conflict'),
    );
    this.status = status;
  }
}

/**
 * Chunked-upload session per destination. The server locks a path to one session until it
 * completes or sits idle for 30 minutes, so a retry after a failure must reuse the old
 * session to take over its lock (and its partial temp file) instead of getting 409. They're
 * stored, so this also works after the app was closed or restarted mid-upload.
 *
 * The server keeps the partial file and writes each chunk at its offset, so a later upload
 * of the same file resumes after the last chunk it confirmed (`offset`). Only within the
 * lock window: while the lock is ours, nothing else can finish an upload to that path.
 */
const SESSION_IDLE_MS = 30 * 60 * 1000;
type Session = {
  id: string;
  /** Last successful chunk (or start), epoch ms. */
  at: number;
  /** Bytes the server has confirmed. */
  offset?: number;
  /** Size and content sample of the file being sent, to resume only the same file. */
  size?: number;
  sample?: string;
};
type Sessions = Record<string, Session>;

function loadSessions(): Sessions {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(readJson<Sessions>(StorageKeys.uploadSessions) ?? {}).filter(
      ([, s]) => now - s.at < SESSION_IDLE_MS,
    ),
  );
}

function saveSessions(all: Sessions) {
  writeJson(StorageKeys.uploadSessions, Object.keys(all).length > 0 ? all : null);
}

/** The session for `key`, created if needed (and then without progress). */
function sessionFor(key: string): Session {
  const all = loadSessions();
  const session = all[key] ?? {
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
    at: Date.now(),
  };
  all[key] = session;
  saveSessions(all);
  return session;
}

function updateSession(key: string, patch: Partial<Session>) {
  const all = loadSessions();
  if (!all[key]) return;
  all[key] = { ...all[key], ...patch, at: Date.now() };
  saveSessions(all);
}

function endSession(key: string) {
  const all = loadSessions();
  delete all[key];
  saveSessions(all);
}

/**
 * The native task rejects with "Call to function 'FileSystemUploadTask.start' has been
 * rejected. → Caused by: Unable to upload a file: <cause>" when no response arrives (DNS,
 * dropped connection, timeout); keep only the cause.
 */
function networkError(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const cause = raw.split('Unable to upload a file:').pop()!.trim();
  return new NetworkError(cause, /timed? ?out/i.test(cause));
}

function isRetryable(e: unknown) {
  return (
    e instanceof NetworkError || (e instanceof UploadHttpError && GATEWAY_ERRORS.includes(e.status))
  );
}

/**
 * One POST of `file`'s bytes to transfer `id`'s server; reports bytes sent through `onSent`.
 * Network and gateway failures are retried a few times, since a short Wi-Fi or DNS drop
 * shouldn't fail a file (chunks resend at the same offset in the same session).
 */
async function postBody(
  id: string,
  url: (base: string) => string,
  file: File,
  headers: Record<string, string>,
  onSent: (bytes: number) => void,
  register: (cancel: () => void) => void,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await postOnce(id, url, file, headers, onSent, register);
    } catch (e) {
      if (!isRetryable(e) || attempt >= RETRY_DELAYS.length) throw e;
      if (getTransfer(id)?.status === 'cancelled') throw e;
      await delay(RETRY_DELAYS[attempt]);
      if (getTransfer(id)?.status === 'cancelled') throw e;
    }
  }
}

async function postOnce(
  id: string,
  url: (base: string) => string,
  file: File,
  headers: Record<string, string>,
  onSent: (bytes: number) => void,
  register: (cancel: () => void) => void,
) {
  const creds = transferCredentials(id);
  // Without the gateway's cookie the body would only be sent to its sign-in page.
  if (creds.gateway && !creds.headers.Cookie) throw new GatewayError();
  const task = file.createUploadTask(url(creds.baseUrl), {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { ...creds.headers, ...headers },
    mimeType: 'application/octet-stream',
  });
  const sub = task.addListener('progress', ({ bytesSent }) => onSent(bytesSent));
  register(() => task.cancel());
  try {
    let result;
    try {
      result = await task.uploadAsync();
    } catch (e) {
      throw networkError(e);
    }
    // Redirects are followed, so a gateway sign-in page shows up as a 200 with HTML.
    if (creds.gateway && isGatewayUploadResult(result.status, result.headers)) {
      throw new GatewayError();
    }
    if (result.status < 200 || result.status >= 300) {
      throw new UploadHttpError(result.status, result.body);
    }
  } finally {
    sub.remove();
    task.release();
  }
}

const SAMPLE_BYTES = 64 * 1024;

/** FNV-1a over the file's first bytes: cheap, and enough to tell a different file apart. */
function sampleOf(handle: FileHandle): string {
  handle.offset = 0;
  const bytes = handle.readBytes(SAMPLE_BYTES);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash = Math.imul(hash ^ bytes[i], 0x01000193);
  }
  return `${bytes.length}:${(hash >>> 0).toString(16)}`;
}

/**
 * Sends a file in `chunkSizeMb` pieces with the backend's chunk headers
 * (X-File-Upload-Session / X-File-Chunk-Offset / X-File-Total-Size), staging each piece in
 * the cache because native upload tasks send whole files.
 */
async function uploadChunked(id: string, picked: PickedFile, target: UploadTarget, path: string) {
  const chunkSize = target.chunkSizeMb * MB;
  const sessionKey = `${getTransfer(id)?.serverId}:${target.source}:${path}`;
  const session = sessionFor(sessionKey);
  const stage = new Directory(Paths.cache, 'upload-chunks', id);
  stage.create({ intermediates: true, idempotent: true });
  let handle: FileHandle | null = null;
  try {
    let source = new File(picked.uri);
    if (picked.uri.startsWith('content:')) {
      // expo-file-system's handle for content:// URIs loses its file descriptor
      // ("Bad file descriptor" on the first read), so read chunks from a local copy instead.
      const local = new File(stage, 'source');
      await source.copy(local);
      source = local;
    }
    handle = source.open(FileMode.ReadOnly);
    const sample = sampleOf(handle);
    // Resume after what the server already has, if this is the same file as last time.
    const same = session.size === picked.size && session.sample === sample;
    let offset = same && session.offset && session.offset < picked.size ? session.offset : 0;
    if (!same) updateSession(sessionKey, { size: picked.size, sample, offset: 0 });
    handle.offset = offset;
    if (offset > 0) {
      // Not counted as transfer speed.
      updateTransfer(id, { loaded: offset, lastSampleLoaded: offset });
    }
    let restarted = false;
    while (offset < picked.size) {
      if (getTransfer(id)?.status === 'cancelled') return;
      const bytes = handle.readBytes(Math.min(chunkSize, picked.size - offset));
      if (bytes.length === 0) break;
      const chunk = new File(stage, `${offset}.part`);
      chunk.write(bytes);
      const start = offset;
      try {
        await postBody(
          id,
          (base) => `${uploadUrl(target.source, path, target.overwrite, base)}&_chunkSeq=${start}`,
          chunk,
          {
            'X-File-Upload-Session': session.id,
            'X-File-Chunk-Offset': String(start),
            'X-File-Total-Size': String(picked.size),
          },
          (sent) => updateTransfer(id, { loaded: start + sent }),
          (cancel) => updateTransfer(id, { cancel }),
        );
      } catch (e) {
        // The server rejected the assembled file (its partial file held other bytes, e.g. a
        // longer earlier file at this path, and it dropped it on the final size check):
        // start over once, in the same session.
        if (!restarted && e instanceof UploadHttpError && e.status === 400) {
          chunk.delete();
          restarted = true;
          offset = 0;
          handle.offset = 0;
          updateSession(sessionKey, { offset: 0 });
          updateTransfer(id, { loaded: 0 });
          continue;
        }
        throw e;
      }
      chunk.delete();
      offset += bytes.length;
      updateSession(sessionKey, { offset });
      updateTransfer(id, { loaded: offset });
    }
    endSession(sessionKey);
  } finally {
    handle?.close();
    try {
      stage.delete();
    } catch {
      // Already gone.
    }
  }
}

/** Queues uploads into `target.dir`; `onFinished` fires once after each file settles. */
export function uploadFiles(
  files: PickedFile[],
  target: UploadTarget,
  onFinished: (ok: boolean, file: PickedFile) => void,
) {
  for (const picked of files) {
    const dir = picked.relDir ? `${joinPath(target.dir, picked.relDir)}/` : target.dir;
    const id = addTransfer({
      kind: 'upload',
      name: picked.name,
      from: '',
      target: `${target.source}:${dir}`,
      total: picked.size,
    });
    const path = joinPath(dir, picked.name);

    const job = async () => {
      if (getTransfer(id)?.status === 'cancelled') return;
      updateTransfer(id, { status: 'active' });
      try {
        const chunked = target.chunkSizeMb > 0 && picked.size > target.chunkSizeMb * MB;
        if (chunked) {
          await uploadChunked(id, picked, target, path);
        } else {
          await postBody(
            id,
            (base) => uploadUrl(target.source, path, target.overwrite, base),
            new File(picked.uri),
            {},
            (sent) => updateTransfer(id, { loaded: sent }),
            (cancel) => updateTransfer(id, { cancel }),
          );
        }
        if (getTransfer(id)?.status === 'cancelled') return;
        updateTransfer(id, { status: 'done', loaded: picked.size });
        onFinished(true, picked);
      } catch (e) {
        if (getTransfer(id)?.status !== 'cancelled') {
          // Keep the cause ("Unable to resolve host …") under the generic message.
          const cause = e instanceof NetworkError && e.message ? `\n${e.message}` : '';
          updateTransfer(id, { status: 'error', error: errorMessage(e) + cause });
        }
        onFinished(false, picked);
      }
    };
    setRestart(id, () => enqueue(job));
    enqueue(job);
  }
}
