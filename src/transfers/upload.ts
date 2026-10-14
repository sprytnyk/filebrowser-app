import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, type FileHandle, FileMode, Paths, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { messageFromBody } from '@/api/client';
import { uploadUrl } from '@/api/resources';
import i18n from '@/i18n';
import { errorMessage } from '@/lib/notify';
import { joinPath } from '@/lib/url';
import { withLockSuspended } from '@/lock/lock-state';
import {
  addTransfer,
  createQueue,
  getTransfer,
  setRestart,
  transferCredentials,
  updateTransfer,
} from '@/transfers/store';

export type PickedFile = { uri: string; name: string; size: number; mimeType: string | null };

const MB = 1024 * 1024;
const enqueue = createQueue(2);

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
 * session to take over its lock (and its partial temp file) instead of getting 409.
 */
const sessions = new Map<string, string>();

function sessionFor(key: string) {
  let id = sessions.get(key);
  if (!id) {
    id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    sessions.set(key, id);
  }
  return id;
}

/** One POST of `file`'s bytes to transfer `id`'s server; reports bytes sent through `onSent`. */
async function postBody(
  id: string,
  url: (base: string) => string,
  file: File,
  headers: Record<string, string>,
  onSent: (bytes: number) => void,
  register: (cancel: () => void) => void,
) {
  const creds = transferCredentials(id);
  const task = file.createUploadTask(url(creds.baseUrl), {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { ...creds.headers, ...headers },
    mimeType: 'application/octet-stream',
  });
  const sub = task.addListener('progress', ({ bytesSent }) => onSent(bytesSent));
  register(() => task.cancel());
  try {
    const result = await task.uploadAsync();
    if (result.status < 200 || result.status >= 300) {
      throw new UploadHttpError(result.status, result.body);
    }
  } finally {
    sub.remove();
    task.release();
  }
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
    let offset = 0;
    while (offset < picked.size) {
      if (getTransfer(id)?.status === 'cancelled') return;
      const bytes = handle.readBytes(Math.min(chunkSize, picked.size - offset));
      if (bytes.length === 0) break;
      const chunk = new File(stage, `${offset}.part`);
      chunk.write(bytes);
      const start = offset;
      await postBody(
        id,
        (base) => `${uploadUrl(target.source, path, target.overwrite, base)}&_chunkSeq=${start}`,
        chunk,
        {
          'X-File-Upload-Session': session,
          'X-File-Chunk-Offset': String(start),
          'X-File-Total-Size': String(picked.size),
        },
        (sent) => updateTransfer(id, { loaded: start + sent }),
        (cancel) => updateTransfer(id, { cancel }),
      );
      chunk.delete();
      offset += bytes.length;
      updateTransfer(id, { loaded: offset });
    }
    sessions.delete(sessionKey);
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
  onFinished: (ok: boolean) => void,
) {
  for (const picked of files) {
    const id = addTransfer({
      kind: 'upload',
      name: picked.name,
      from: '',
      target: `${target.source}:${target.dir}`,
      total: picked.size,
    });
    const path = joinPath(target.dir, picked.name);

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
        onFinished(true);
      } catch (e) {
        if (getTransfer(id)?.status !== 'cancelled') {
          updateTransfer(id, { status: 'error', error: errorMessage(e) });
        }
        onFinished(false);
      }
    };
    setRestart(id, () => enqueue(job));
    enqueue(job);
  }
}
