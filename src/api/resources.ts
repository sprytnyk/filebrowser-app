import { apiUrl, request, requestJson } from '@/api/client';
import {
  type FileItem,
  type Listing,
  type RawItem,
  type RawListing,
  type SearchResult,
} from '@/api/types';
import { joinPath } from '@/lib/url';

/** Merges `folders` + `files` and gives every item its absolute path, like upstream's adjustedData. */
export function toListing(raw: RawListing): Listing {
  const dir = raw.path.endsWith('/') ? raw.path : `${raw.path}/`;
  const toItem = (item: RawItem, isDir: boolean): FileItem => ({
    ...item,
    source: raw.source,
    isDir,
    path: joinPath(dir, item.name) + (isDir ? '/' : ''),
  });
  return {
    source: raw.source,
    path: dir,
    name: raw.name,
    size: raw.size,
    items: [
      ...(raw.folders ?? []).map((f) => toItem(f, true)),
      ...(raw.files ?? []).map((f) => toItem(f, false)),
    ],
  };
}

export async function getListing(source: string, path: string): Promise<Listing> {
  const raw = await requestJson<RawListing>('resources', { params: { source, path } });
  return toListing(raw);
}

export async function createFolder(source: string, dir: string, name: string): Promise<void> {
  await request('resources', {
    method: 'POST',
    params: { source, path: `${joinPath(dir, name)}/`, isDir: 'true' },
  });
}

export type MoveCopyItem = {
  fromSource: string;
  fromPath: string;
  toSource: string;
  toPath: string;
};

export type BulkResult<T> = { succeeded: T[]; failed: (T & { message?: string })[] };

/** PATCH /api/resources handles rename, move and copy; partial failures come back in `failed`. */
export async function moveCopy(
  items: MoveCopyItem[],
  action: 'move' | 'copy' | 'rename',
  overwrite = false,
): Promise<BulkResult<MoveCopyItem>> {
  const res = await request('resources', {
    method: 'PATCH',
    timeoutMs: 120_000,
    json: {
      items: items.map((i) => ({
        fromSource: i.fromSource,
        fromPath: stripSlash(i.fromPath),
        toSource: i.toSource,
        toPath: stripSlash(i.toPath),
      })),
      action,
      overwrite,
      rename: false,
    },
  });
  return (await res.json()) as BulkResult<MoveCopyItem>;
}

export type DeleteItem = { source: string; path: string };

export async function bulkDelete(items: DeleteItem[]): Promise<BulkResult<DeleteItem>> {
  const res = await request('resources/bulk', {
    method: 'DELETE',
    timeoutMs: 120_000,
    json: items,
  });
  return (await res.json()) as BulkResult<DeleteItem>;
}

/** The server hashes the whole file before it answers, which takes a while for big ones. */
const CHECKSUM_TIMEOUT_MS = 10 * 60 * 1000;

/** A hex digest, with the file's size and modified time as the server read them just before. */
export type Checksum = Pick<FileItem, 'size' | 'modified'> & { value: string };

/** Digest of a file, computed by the server (md5, sha1, sha256 and sha512). */
export async function fileChecksum(
  item: Pick<FileItem, 'source' | 'path'>,
  algo: 'md5' | 'sha1' | 'sha256' | 'sha512',
): Promise<Checksum> {
  const info = await requestJson<RawItem & { checksums?: Record<string, string> }>('resources', {
    params: { source: item.source, path: item.path, checksum: algo },
    timeoutMs: CHECKSUM_TIMEOUT_MS,
  });
  const value = info.checksums?.[algo];
  if (!value) throw new Error(`The server sent no ${algo} checksum`);
  return { value, size: info.size, modified: info.modified };
}

/** Thumbnail URL; send it with authHeaders(). */
export function previewUrl(item: Pick<FileItem, 'source' | 'path'>, size: 'small' | 'large') {
  return apiUrl('resources/preview', { source: item.source, path: item.path, size });
}

/** Raw file contents: downloads, inline images, and audio/video playback (not inline). */
export function rawUrl(item: Pick<FileItem, 'source' | 'path'>, inline = false) {
  return apiUrl('raw', { source: item.source, file: item.path, inline: inline || undefined });
}

/** Zip of folders and/or several files from one source. */
export function archiveUrl(source: string, paths: string[]) {
  return apiUrl('resources/download', { source, file: paths, algo: 'zip' });
}

export function uploadUrl(source: string, path: string, overwrite: boolean, base?: string) {
  return apiUrl('resources', { source, path, override: overwrite }, base);
}

export async function search(
  source: string,
  dir: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  return requestJson<SearchResult[]>('tools/search', {
    params: { query, sources: source, scope: `${source}:${dir}` },
    signal,
  });
}

/**
 * Search results carry paths relative to the searched folder (`scope`), not the source root,
 * plus a mime-ish `type`; map them onto FileItem.
 */
export function searchResultToItem(r: SearchResult, dir: string): FileItem {
  const isDir = r.type === 'directory';
  const base = dir.endsWith('/') ? dir : `${dir}/`;
  const path = `${base}${r.path.replace(/^\/+/, '')}${isDir && !r.path.endsWith('/') ? '/' : ''}`;
  const name = stripSlash(path).slice(stripSlash(path).lastIndexOf('/') + 1);
  return { ...r, name, path, isDir, hidden: name.startsWith('.') };
}

function stripSlash(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}
