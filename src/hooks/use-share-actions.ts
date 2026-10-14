import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Share } from 'react-native';

import { deleteShare } from '@/api/share';
import { type ShareLink } from '@/api/types';
import { confirm, showError, toast } from '@/lib/notify';
import { withLockSuspended } from '@/lock/lock-state';

/** Copy / send / open / delete for share links, used by the share sheet and the Shares tab. */
export function useShareActions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  async function copy(url: string) {
    await Clipboard.setStringAsync(url);
    toast(t('buttons.copySuccess'));
  }

  async function send(url: string, title?: string) {
    await withLockSuspended(() => Share.share({ message: url, title }));
  }

  async function open(url: string) {
    await withLockSuspended(() => WebBrowser.openBrowserAsync(url));
  }

  /** Asks first; resolves to true once the share is gone. */
  async function remove(share: ShareLink) {
    const ok = await confirm(
      t('prompts.deleteTitle'),
      t('prompts.deleteMessageShare', { path: share.path }),
      t('general.delete'),
      true,
    );
    if (!ok) return false;
    try {
      await deleteShare(share.hash);
      toast(t('settings.shareDeleted'));
      await queryClient.invalidateQueries({ queryKey: ['shares'] });
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  }

  return { copy, send, open, remove };
}
