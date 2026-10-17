import { AppState, PermissionsAndroid, Platform } from 'react-native';

import i18n from '@/i18n';
import { formatSize } from '@/lib/files';
import {
  hasTransferService,
  hideTransferService,
  type ServiceNotification,
  showTransferService,
} from '@/lib/transfer-service';
import { withLockSuspended } from '@/lock/lock-state';
import { readJson, StorageKeys, writeJson } from '@/session/storage';
import {
  batchProgress,
  getTransfers,
  isRunning,
  subscribeTransfers,
  type Transfer,
} from '@/transfers/store';

/** Android drops notification updates that come too fast; once a second suits a progress bar. */
const UPDATE_INTERVAL = 1000;

let shown = false;
let lastUpdateAt = 0;
let lastCount = 0;
/** Transfers that ran while the service was up, for the summary once it stops. */
const ran = new Set<string>();

/**
 * Downloads for the viewer and "Open with" happen while the user watches the screen; a
 * notification for each opened image would only flicker.
 */
const kept = (t: Transfer) => isRunning(t) && !(t.kind === 'download' && t.target === '');

/**
 * Runs the foreground service while any transfer is queued or running, so transfers go on
 * when the app is in the background. Call once at startup.
 */
export function keepTransfersRunning() {
  if (!hasTransferService()) return;
  subscribeTransfers(sync);
}

function sync() {
  const all = getTransfers();
  const running = all.filter(kept);
  const channel = i18n.t('mobile.transfers');
  if (running.length === 0) {
    if (!shown) return;
    shown = false;
    hideTransferService(channel, summary(all));
    ran.clear();
    return;
  }
  for (const t of running) ran.add(t.id);
  const now = Date.now();
  if (shown && running.length === lastCount && now - lastUpdateAt < UPDATE_INTERVAL) return;
  if (!shown) void askForNotifications();
  shown = true;
  lastUpdateAt = now;
  lastCount = running.length;

  const { loaded, total } = batchProgress(running);
  const rate = running.reduce((sum, t) => sum + (t.rate ?? 0), 0);
  const size = total > 0 ? `${formatSize(loaded)} / ${formatSize(total)}` : formatSize(loaded);
  const notification: ServiceNotification = {
    channel,
    title: i18n.t('mobile.transferring', { count: running.length }),
    text: rate > 0 ? `${size} · ${formatSize(rate)}/s` : size,
    icon: running.every((t) => t.kind === 'upload') ? 'upload' : 'download',
  };
  showTransferService(notification, total > 0 ? loaded / total : null);
}

/** How the transfers ended, when nobody is looking at the app to see it there. */
function summary(all: readonly Transfer[]) {
  if (AppState.currentState === 'active') return undefined;
  const settled = all.filter((t) => ran.has(t.id));
  const done = settled.filter((t) => t.status === 'done').length;
  const failed = settled.filter((t) => t.status === 'error').length;
  if (done + failed === 0) return undefined;
  return {
    title: i18n.t('mobile.transfersFinished'),
    text:
      failed > 0
        ? i18n.t('mobile.transfersFinishedFailed', { done, failed })
        : i18n.t('mobile.transfersFinishedOk', { count: done }),
    icon:
      failed > 0
        ? ('error' as const)
        : settled.every((t) => t.kind === 'upload')
          ? ('uploadDone' as const)
          : ('downloadDone' as const),
  };
}

/**
 * Android 13+ hides the service's notification without this permission; the service runs
 * either way. Asked once, with the first transfer.
 */
async function askForNotifications() {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  if (AppState.currentState !== 'active' || readJson<boolean>(StorageKeys.notificationsAsked)) {
    return;
  }
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  try {
    if (await PermissionsAndroid.check(permission)) return;
    writeJson(StorageKeys.notificationsAsked, true);
    await withLockSuspended(() => PermissionsAndroid.request(permission));
  } catch {
    // No permission dialog available; the transfers don't depend on it.
  }
}
