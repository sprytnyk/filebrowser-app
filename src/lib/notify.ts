import { ToastAndroid } from 'react-native';

import { ApiError, NetworkError } from '@/api/client';
import i18n from '@/i18n';
import { ask } from '@/lib/dialog';
import { showToast, type ToastAction } from '@/lib/toast';

/** Snackbar message, with an optional action button. */
export function toast(message: string, action?: ToastAction) {
  if (!showToast(message, action)) ToastAndroid.show(message, ToastAndroid.SHORT);
}

export function errorMessage(e: unknown): string {
  if (e instanceof NetworkError) {
    return e.timedOut ? i18n.t('errors.requestTimedOut') : i18n.t('errors.connection');
  }
  if (e instanceof ApiError) {
    if (e.status === 403) return i18n.t('errors.forbidden');
    if (e.status === 404) return i18n.t('errors.notFound');
    return e.message;
  }
  return e instanceof Error ? e.message : i18n.t('prompts.error');
}

export function showMessage(title: string, message: string) {
  void ask({ title, message, buttons: [{ id: 'ok', label: i18n.t('general.ok') }] });
}

export function showError(e: unknown, title = i18n.t('general.error')) {
  showMessage(title, errorMessage(e));
}

export async function confirm(
  title: string,
  message: string,
  confirmLabel: string,
  destructive = false,
): Promise<boolean> {
  const answer = await ask({
    title,
    message,
    buttons: [
      { id: 'cancel', label: i18n.t('general.cancel'), kind: 'cancel' },
      { id: 'ok', label: confirmLabel, kind: destructive ? 'destructive' : 'default' },
    ],
  });
  return answer === 'ok';
}
