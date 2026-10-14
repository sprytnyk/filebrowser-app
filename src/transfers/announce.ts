import { router } from 'expo-router';

import i18n from '@/i18n';
import { toast } from '@/lib/notify';

/** Snackbar for newly queued transfers, with a shortcut to the Transfers tab. */
export function announceTransfers(count: number) {
  toast(i18n.t('mobile.addedToTransfers', { count }), {
    label: i18n.t('mobile.view'),
    onPress: () => router.navigate('/transfers'),
  });
}
