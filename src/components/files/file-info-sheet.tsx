import { useTranslation } from 'react-i18next';

import { type FileItem } from '@/api/types';
import { HashCard } from '@/components/files/hash-card';
import { ActionSheet } from '@/components/ui/action-sheet';
import { useSha256 } from '@/hooks/use-sha256';
import { formatDate, formatSize } from '@/lib/files';
import { errorMessage } from '@/lib/notify';
import { parentDir } from '@/lib/url';

/** A file's or folder's details and, for files, its SHA-256. Open while `item` is set. */
export function FileInfoSheet({ item, onClose }: { item: FileItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const sha256 = useSha256(item && !item.isDir ? item : null);

  function details(item: FileItem) {
    // Size and date of the version the hash belongs to, which can be newer than the list.
    const shown = sha256.hashed ?? item;
    return [
      { label: t('general.path'), value: `${item.source}:${item.path}` },
      // For a folder, the server's total for everything inside it.
      { label: t('general.size'), value: formatSize(shown.size) },
      { label: t('files.lastModified'), value: formatDate(shown.modified) },
      item.isDir ? null : { label: t('general.type'), value: item.type },
      sha256.changed
        ? { label: t('mobile.fileChanged'), value: t('mobile.fileChangedHint') }
        : null,
    ].filter((d): d is { label: string; value: string } => d !== null);
  }

  return (
    <ActionSheet
      visible={item !== null}
      title={item?.name}
      subtitle={t('prompts.fileInfo')}
      details={item ? details(item) : []}
      actions={[]}
      onClose={onClose}
      onSelect={() => {}}>
      {item && !item.isDir ? (
        <HashCard
          label="SHA-256"
          value={sha256.value}
          calculating={sha256.calculating}
          error={sha256.error ? errorMessage(sha256.error) : null}
          onCalculate={sha256.calculate}
        />
      ) : null}
    </ActionSheet>
  );
}

/** Totals for several selected items; folders count with their server-reported size. */
export function SelectionInfoSheet({
  items,
  onClose,
}: {
  items: FileItem[] | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const files = items?.filter((i) => !i.isDir) ?? [];
  const folders = (items?.length ?? 0) - files.length;
  // Search results can come from different folders; name the folder only when they share one.
  const dirs = new Set(items?.map((i) => `${i.source}:${parentDir(i.path)}`));
  const details = [
    dirs.size === 1 ? { label: t('general.path'), value: [...dirs][0] } : null,
    {
      label: t('general.size'),
      value: formatSize(items?.reduce((sum, i) => sum + i.size, 0) ?? 0),
    },
    folders > 0 ? { label: t('general.folders'), value: String(folders) } : null,
    files.length > 0 ? { label: t('general.files'), value: String(files.length) } : null,
  ].filter((d): d is { label: string; value: string } => d !== null);

  return (
    <ActionSheet
      visible={items !== null}
      title={items ? t('mobile.selectedCount', { count: items.length }) : undefined}
      subtitle={t('prompts.fileInfo')}
      details={details}
      actions={[]}
      onClose={onClose}
      onSelect={() => {}}
    />
  );
}
