import { type FileItem } from '@/api/types';
import { type IconName } from '@/components/ui/icon';
import { IconColors } from '@/constants/theme';
import i18n, { formatLocale } from '@/i18n';
import { type SortBy } from '@/session/prefs';

export type FileKind =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'archive'
  | 'text'
  | 'code'
  | 'document'
  | 'other';

const ARCHIVE_EXT = /\.(zip|tar|gz|tgz|bz2|xz|7z|rar|zst)$/i;
const CODE_EXT =
  /\.(js|jsx|ts|tsx|py|go|rs|java|kt|c|cc|cpp|h|cs|rb|php|sh|json|ya?ml|toml|xml|html?|css|sql)$/i;
const DOC_EXT = /\.(docx?|odt|xlsx?|ods|pptx?|odp|rtf|epub)$/i;

/** The backend reports `type` as "directory" or a MIME type (e.g. "image/png"). */
export function fileKind(item: Pick<FileItem, 'isDir' | 'type' | 'name'>): FileKind {
  if (item.isDir) return 'folder';
  const type = item.type.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (ARCHIVE_EXT.test(item.name)) return 'archive';
  if (CODE_EXT.test(item.name)) return 'code';
  if (DOC_EXT.test(item.name)) return 'document';
  if (type.startsWith('text/')) return 'text';
  return 'other';
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|mkv|webm|mov|avi|m4v|wmv|flv)$/i;
const AUDIO_EXT = /\.(mp3|flac|ogg|opus|wav|m4a|aac|wma)$/i;

/** For items known only by name (e.g. share links, which carry no MIME type). */
export function kindFromName(name: string, isDir: boolean): FileKind {
  if (isDir) return 'folder';
  if (IMAGE_EXT.test(name)) return 'image';
  if (VIDEO_EXT.test(name)) return 'video';
  if (AUDIO_EXT.test(name)) return 'audio';
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (/\.(txt|md|log|csv)$/i.test(name)) return 'text';
  return fileKind({ isDir, type: '', name });
}

const KIND_ICONS: Record<FileKind, IconName> = {
  folder: 'folder',
  image: 'image',
  video: 'movie',
  audio: 'music_note',
  pdf: 'picture_as_pdf',
  archive: 'folder_zip',
  text: 'description',
  code: 'code',
  document: 'article',
  other: 'insert_drive_file',
};

export function kindIcon(kind: FileKind): { name: IconName; color: string } {
  const color = kind in IconColors ? IconColors[kind as keyof typeof IconColors] : IconColors.other;
  return { name: KIND_ICONS[kind], color };
}

/** Viewable inside the app; everything else goes to "Open with". */
export function isViewable(kind: FileKind) {
  return kind === 'image' || kind === 'video' || kind === 'audio';
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 100 so 10.6 GB doesn't read as 10 GB; "10.0" collapses to "10".
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const number = value.toLocaleString(formatLocale(), {
    maximumFractionDigits: digits,
    useGrouping: false,
  });
  return `${number} ${units[unit]}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(formatLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Folders first, then by the chosen key; names compare naturally ("file2" < "file10"). */
export function sortItems(items: FileItem[], by: SortBy, asc: boolean): FileItem[] {
  const dir = asc ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    let cmp = 0;
    if (by === 'size') cmp = a.size - b.size;
    else if (by === 'modified') cmp = Date.parse(a.modified) - Date.parse(b.modified);
    if (cmp === 0) cmp = collator.compare(a.name, b.name);
    return cmp * dir;
  });
}

/** Names can't contain path separators (upstream renameMessageInvalid). */
export function isValidName(name: string) {
  const trimmed = name.trim();
  return trimmed !== '' && trimmed !== '.' && trimmed !== '..' && !/[/\\]/.test(trimmed);
}

/** "8 s", "2 min 5 s", "1 h 3 min". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return i18n.t('mobile.durationHours', { h, m });
  if (m > 0) {
    return s > 0
      ? i18n.t('mobile.durationMinutes', { m, s })
      : i18n.t('mobile.durationMinutesOnly', { m });
  }
  return i18n.t('mobile.durationSeconds', { s });
}
