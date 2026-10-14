import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import * as resources from '@/api/resources';
import { type FileItem } from '@/api/types';
import { setPendingTransfer } from '@/lib/move-store';
import { confirm, showError, toast } from '@/lib/notify';
import { parentDir } from '@/lib/url';

export function useInvalidateListing() {
  const queryClient = useQueryClient();
  return useCallback(
    (source?: string, path?: string) =>
      queryClient.invalidateQueries({
        queryKey: source && path ? ['listing', source, path] : ['listing'],
      }),
    [queryClient],
  );
}

export function useFileActions() {
  const { t } = useTranslation();
  const invalidate = useInvalidateListing();

  const createFolder = useCallback(
    async (source: string, dir: string, name: string) => {
      try {
        await resources.createFolder(source, dir, name);
        toast(t('files.newFolderSuccess'));
        await invalidate(source, dir);
      } catch (e) {
        showError(e);
      }
    },
    [invalidate, t],
  );

  const rename = useCallback(
    async (item: FileItem, newName: string) => {
      const dir = parentDir(item.path);
      try {
        const result = await resources.moveCopy(
          [
            {
              fromSource: item.source,
              fromPath: item.path,
              toSource: item.source,
              toPath: `${dir}${newName}`,
            },
          ],
          'rename',
        );
        if (result.failed.length > 0) {
          throw new Error(result.failed[0].message || t('prompts.renameFailed'));
        }
        toast(t('prompts.renameSuccess'));
      } catch (e) {
        showError(e, t('prompts.renameFailed'));
      } finally {
        await invalidate(item.source, dir);
      }
    },
    [invalidate, t],
  );

  /** Confirms, deletes, and reports partial failures (HTTP 207). Returns true when anything went. */
  const remove = useCallback(
    async (items: FileItem[]): Promise<boolean> => {
      if (items.length === 0) return false;
      const ok = await confirm(
        t('prompts.deleteTitle'),
        items.length === 1
          ? t('prompts.deleteMessageSingle')
          : t('prompts.deleteMessageMultiple', { count: items.length }),
        t('general.delete'),
        true,
      );
      if (!ok) return false;
      try {
        const result = await resources.bulkDelete(
          items.map((i) => ({ source: i.source, path: i.path })),
        );
        if (result.failed.length > 0) {
          showError(
            new Error(result.failed.map((f) => `${f.path}: ${f.message ?? ''}`).join('\n')),
          );
        } else {
          toast(t('prompts.deleted'));
        }
        return result.succeeded.length > 0;
      } catch (e) {
        showError(e);
        return false;
      } finally {
        await invalidate();
      }
    },
    [invalidate, t],
  );

  const startTransfer = useCallback((mode: 'move' | 'copy', items: FileItem[]) => {
    if (items.length === 0) return;
    setPendingTransfer({ mode, items });
    router.push({
      pathname: '/move-copy',
      params: { source: items[0].source, path: parentDir(items[0].path) },
    });
  }, []);

  return { createFolder, rename, remove, startTransfer };
}
