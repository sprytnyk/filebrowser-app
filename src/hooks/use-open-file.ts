import { type File } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { type FileItem } from '@/api/types';
import { fileKind, isViewable } from '@/lib/files';
import { showError, toast } from '@/lib/notify';
import { canViewPdf } from '@/lib/pdf';
import { setViewerItems } from '@/lib/viewer-store';
import { withLockSuspended } from '@/lock/lock-state';
import { useSelf } from '@/session/session';
import { downloadForOpen } from '@/transfers/download';

const FLAG_GRANT_READ_URI_PERMISSION = 1;

export function useOpenFile() {
  const { t } = useTranslation();
  const { data: self } = useSelf();

  /**
   * Media opens in the viewer (paging through `siblings`) and PDFs in the PDF screen; other
   * files go to "Open with".
   */
  const open = useCallback(
    (item: FileItem, siblings: FileItem[] = [item]) => {
      const perms = self?.scopes.find((s) => s.name === item.source)?.permissions;
      const kind = fileKind(item);
      if (isViewable(kind)) {
        setViewerItems(siblings.filter((s) => isViewable(fileKind(s))));
        router.push({ pathname: '/viewer', params: { source: item.source, path: item.path } });
        return;
      }
      if (perms && !perms.download) {
        toast(t('files.noDownloadAccess'));
        return;
      }
      if (kind === 'pdf' && canViewPdf()) {
        setViewerItems([item]);
        router.push({ pathname: '/pdf', params: { source: item.source, path: item.path } });
        return;
      }
      void openExternally(item);
    },
    [self, t],
  );

  return open;
}

export async function openExternally(item: FileItem) {
  try {
    const file = await downloadForOpen(item);
    if (file) await openWith(file, item);
  } catch (e) {
    showError(e);
  }
}

const GENERIC_TYPE = 'application/octet-stream';

/**
 * The server's type as a MIME type Android can match. For content it can't identify it sends
 * placeholders such as "blob", which no app accepts, not even in the share sheet.
 */
function mimeType(item: FileItem) {
  const type = item.type.toLowerCase();
  return /^[a-z0-9][\w.+-]*\/[\w.+-]+$/.test(type) ? type : GENERIC_TYPE;
}

/** Hands a local copy of `item` to the app the user picks. */
export async function openWith(file: File, item: FileItem) {
  const type = mimeType(item);
  // Apps that open "any file" are rarely what's wanted for an unknown type; the share sheet
  // offers saving it (Files, Drive) and sending it instead.
  if (type !== GENERIC_TYPE) {
    try {
      await withLockSuspended(() =>
        IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: file.contentUri,
          type,
          flags: FLAG_GRANT_READ_URI_PERMISSION,
        }),
      );
      return;
    } catch {
      // No app handles this type; offer the share sheet instead.
    }
  }
  await withLockSuspended(() =>
    Sharing.shareAsync(file.uri, { mimeType: type, dialogTitle: item.name }),
  );
}
