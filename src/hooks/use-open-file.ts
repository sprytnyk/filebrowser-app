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

/** Hands a local copy of `item` to the app the user picks. */
export async function openWith(file: File, item: FileItem) {
  try {
    await withLockSuspended(() =>
      IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: file.contentUri,
        type: item.type || 'application/octet-stream',
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      }),
    );
  } catch {
    // No app handles this type; offer the share sheet instead.
    await withLockSuspended(() =>
      Sharing.shareAsync(file.uri, { mimeType: item.type, dialogTitle: item.name }),
    );
  }
}
