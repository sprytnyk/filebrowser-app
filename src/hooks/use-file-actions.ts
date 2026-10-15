import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import * as resources from '@/api/resources';
import { type FileItem } from '@/api/types';
import { setPendingTransfer } from '@/lib/move-store';
import { confirm, showError, toast } from '@/lib/notify';
import { adjustUsage } from '@/lib/space';
import { parentDir } from '@/lib/url';

/**
 * The server caches each source's disk usage for 30 s after computing it, so free space
 * changed by a delete or upload only shows once that has expired.
 */
const USAGE_CACHE_MS = 31_000;
let usageTimer: ReturnType<typeof setTimeout> | null = null;

/** Refreshes listings after a change, and the sources' free space once the server has it. */
export function useInvalidateListing() {
  const queryClient = useQueryClient();
  return useCallback(
    (source?: string, path?: string) => {
      // Restarted on every change, so the refetch comes after the last one has settled.
      if (usageTimer) clearTimeout(usageTimer);
      usageTimer = setTimeout(() => {
        usageTimer = null;
        void queryClient.invalidateQueries({ queryKey: ['sources'] });
      }, USAGE_CACHE_MS);
      return queryClient.invalidateQueries({
        queryKey: source && path ? ['listing', source, path] : ['listing'],
      });
    },
    [queryClient],
  );
}

export function useFileActions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
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
        const gone = new Set(result.succeeded.map((s) => `${s.source}:${s.path}`));
        for (const item of items) {
          if (gone.has(`${item.source}:${item.path}`)) {
            adjustUsage(queryClient, item.source, -item.size);
          }
        }
        return result.succeeded.length > 0;
      } catch (e) {
        showError(e);
        return false;
      } finally {
        await invalidate();
      }
    },
    [invalidate, queryClient, t],
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
