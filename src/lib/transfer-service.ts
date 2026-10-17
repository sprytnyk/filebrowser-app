import { requireOptionalNativeModule } from 'expo';

/**
 * The app's foreground service for transfers (modules/transfer-service). It keeps the process
 * running while the app is in the background, with an ongoing notification. Expo Go lacks the
 * module, so there transfers pause in the background as before.
 */
export type NotificationIcon = 'upload' | 'download' | 'uploadDone' | 'downloadDone' | 'error';

type TransferServiceModule = {
  show(
    channelName: string,
    title: string,
    text: string,
    progress: number,
    icon: NotificationIcon,
  ): void;
  hide(
    channelName: string,
    title: string | null,
    text: string | null,
    icon: NotificationIcon | null,
  ): void;
  delay(ms: number): Promise<void>;
};

const native = requireOptionalNativeModule<TransferServiceModule>('TransferService');

export function hasTransferService(): boolean {
  return native !== null;
}

export type ServiceNotification = {
  /** Name of the notification channel in the system settings. */
  channel: string;
  title: string;
  text: string;
  icon: NotificationIcon;
};

/** Starts the service or updates its notification; `progress` is 0–1, or null when unknown. */
export function showTransferService(n: ServiceNotification, progress: number | null) {
  const value = progress === null ? -1 : Math.round(Math.min(1, Math.max(0, progress)) * 1000);
  native?.show(n.channel, n.title, n.text, value, n.icon);
}

/** Stops the service; `finished` stays behind as a regular notification. */
export function hideTransferService(
  channel: string,
  finished?: Omit<ServiceNotification, 'channel'>,
) {
  native?.hide(channel, finished?.title ?? null, finished?.text ?? null, finished?.icon ?? null);
}

/**
 * Waits `ms`, also while the app is in the background: React Native pauses setTimeout there,
 * which would hold up retries until the app is opened again.
 */
export function delay(ms: number): Promise<void> {
  return native ? native.delay(ms) : new Promise((resolve) => setTimeout(resolve, ms));
}
