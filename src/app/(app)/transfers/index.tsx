import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SectionList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HeaderButton } from '@/components/ui/header-button';
import { Icon } from '@/components/ui/icon';
import { ToastHost } from '@/components/ui/toast-host';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatLocale } from '@/i18n';
import { formatDuration, formatSize } from '@/lib/files';
import { profileName, useServers } from '@/session/servers';
import {
  batchProgress,
  cancelTransfer,
  clearFinished,
  isRunning,
  retryTransfer,
  type Transfer,
  useTransfers,
} from '@/transfers/store';

export default function TransfersScreen() {
  const { t } = useTranslation();
  const transfers = useTransfers();
  const running = transfers.filter(isRunning);
  // Newest first; finished ones by when they ended.
  const finished = transfers
    .filter((x) => !isRunning(x))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const sections = [
    { key: 'running', title: t('mobile.inProgress'), data: [...running].reverse() },
    { key: 'finished', title: t('mobile.finished'), data: finished },
  ].filter((s) => s.data.length > 0);

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          title: t('mobile.transfers'),
          headerRight: () =>
            finished.length > 0 ? (
              <HeaderButton
                icon="clear_all"
                label={t('buttons.clearCompleted')}
                onPress={clearFinished}
              />
            ) : null,
        }}
      />
      {/* Outside the list so it stays in view while scrolling. */}
      {running.length > 0 ? <Summary running={running} /> : null}
      <SectionList
        sections={sections}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="swap_vert" size={48} />
            <ThemedText themeColor="textSecondary">{t('mobile.noTransfers')}</ThemedText>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
            {section.title} ({section.data.length})
          </ThemedText>
        )}
        renderItem={({ item }) => <TransferRow transfer={item} />}
      />
      <ToastHost />
    </ThemedView>
  );
}

/** Totals across the current batch, including files in it that already finished. */
function Summary({ running }: { running: Transfer[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { loaded, total } = batchProgress(running);
  const known = total > 0;
  const rate = running.reduce((sum, x) => sum + (x.rate ?? 0), 0);

  // A band under the header (same color, full width) that the list scrolls beneath. Its
  // lines and bar are always there, so it keeps one height while the numbers change.
  return (
    <View
      style={[
        styles.summary,
        { backgroundColor: theme.surfacePrimary, borderColor: theme.surfaceSecondary },
      ]}>
      <StatLine
        type="small"
        left={t('mobile.transfersActive', { count: running.length })}
        right={known ? `${formatSize(loaded)} / ${formatSize(total)}` : formatSize(loaded)}
      />
      <ProgressBar fraction={known ? loaded / total : 0} />
      <StatLine
        left={rate > 0 ? `${formatSize(rate)}/s` : ''}
        right={
          known && rate > 0
            ? t('mobile.timeLeft', { time: formatDuration(((total - loaded) / rate) * 1000) })
            : ''
        }
      />
    </View>
  );
}

/** One line of numbers, start- and end-aligned, with fixed-width digits. */
function StatLine({
  left,
  right,
  type = 'caption',
}: {
  left: string;
  right?: string;
  type?: 'small' | 'caption';
}) {
  return (
    <View style={styles.statLine}>
      <ThemedText
        type={type}
        themeColor={type === 'caption' ? 'textSecondary' : undefined}
        numberOfLines={1}
        style={[styles.numbers, styles.shrink]}>
        {/* A space keeps the line's height while it has nothing to show. */}
        {left || ' '}
      </ThemedText>
      {right ? (
        <ThemedText
          type={type}
          themeColor={type === 'caption' ? 'textSecondary' : undefined}
          numberOfLines={1}
          style={styles.numbers}>
          {right}
        </ThemedText>
      ) : null}
    </View>
  );
}

function ProgressBar({ fraction, color }: { fraction: number; color?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.surfaceSecondary }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: color ?? theme.primary,
            width: `${Math.min(1, Math.max(0, fraction)) * 100}%`,
          },
        ]}
      />
    </View>
  );
}

function TransferRow({ transfer }: { transfer: Transfer }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { status, loaded, total, rate } = transfer;
  const running = isRunning(transfer);
  const upload = transfer.kind === 'upload';

  // Name the server the remote side is on; follows renames while the server is still known.
  const profile = useServers().profiles.find((p) => p.id === transfer.serverId);
  const serverName = profile ? profileName(profile) : transfer.serverLabel;
  const from = upload ? t('mobile.thisDevice') : transfer.from;
  const to = upload ? transfer.target : transfer.target || t('mobile.openWith');

  // Running rows show two fixed lines (amount, then speed and time left) instead of `detail`.
  let detail = '';
  let speed = '';
  switch (status) {
    case 'queued':
      detail = t('mobile.queued');
      break;
    case 'active': {
      detail =
        total > 0
          ? `${Math.floor((loaded / total) * 100)}% · ${formatSize(loaded)} / ${formatSize(total)}`
          : formatSize(loaded);
      speed = [
        rate ? `${formatSize(rate)}/s` : null,
        rate && total > 0
          ? t('mobile.timeLeft', { time: formatDuration(((total - loaded) / rate) * 1000) })
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
      break;
    }
    case 'done': {
      const took =
        transfer.startedAt && transfer.finishedAt ? transfer.finishedAt - transfer.startedAt : null;
      const size = formatSize(total || loaded);
      detail = [
        t('prompts.completed'),
        took !== null ? t('mobile.finishedIn', { size, time: formatDuration(took) }) : size,
        took ? `${formatSize(((total || loaded) * 1000) / Math.max(took, 1))}/s` : null,
        finishedTime(transfer),
      ]
        .filter(Boolean)
        .join(' · ');
      break;
    }
    case 'error':
      detail = `${t('mobile.failed')} · ${finishedTime(transfer)}\n${transfer.error ?? t('general.error')}`;
      break;
    case 'cancelled':
      detail = `${t('mobile.cancelled')} · ${finishedTime(transfer)}`;
      break;
  }

  // Uploads are green and downloads blue, unless the transfer failed or was cancelled.
  const direction = upload ? theme.upload : theme.download;
  const [tint, tintBackground] =
    status === 'error'
      ? [theme.danger, theme.errorBackground]
      : status === 'cancelled'
        ? [theme.textSecondary, theme.surfaceSecondary]
        : [direction, upload ? theme.uploadBackground : theme.downloadBackground];

  return (
    <View style={[styles.row, { backgroundColor: theme.surfacePrimary, borderLeftColor: tint }]}>
      <View style={[styles.badge, { backgroundColor: tintBackground }]}>
        <Icon name={upload ? 'upload' : 'download'} color={tint} />
      </View>
      <View style={styles.flex}>
        <ThemedText numberOfLines={1}>{transfer.name}</ThemedText>
        {serverName ? (
          <View style={styles.route}>
            <Icon name="dns" size={14} color={theme.textSecondary} />
            <ThemedText
              type="caption"
              themeColor="textSecondary"
              numberOfLines={1}
              style={styles.shrink}>
              {serverName}
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.route}>
          <Icon name={upload ? 'smartphone' : 'cloud'} size={14} color={theme.textSecondary} />
          <ThemedText
            type="caption"
            themeColor="textSecondary"
            numberOfLines={1}
            ellipsizeMode="middle"
            style={styles.shrink}>
            {from}
          </ThemedText>
          <Icon name="arrow_forward" size={14} color={tint} />
          <Icon name={upload ? 'cloud' : 'smartphone'} size={14} color={theme.textSecondary} />
          <ThemedText
            type="caption"
            themeColor="textSecondary"
            numberOfLines={1}
            ellipsizeMode="middle"
            style={styles.shrink}>
            {to}
          </ThemedText>
        </View>
        {/* Queued rows reserve the bar too, so starting doesn't change the row height. */}
        {running ? (
          <ProgressBar fraction={total > 0 ? loaded / total : 0} color={direction} />
        ) : null}
        {running ? (
          <>
            <StatLine left={detail} />
            <StatLine left={speed} />
          </>
        ) : (
          <ThemedText
            type="caption"
            themeColor={status === 'error' ? 'danger' : 'textSecondary'}
            numberOfLines={status === 'error' ? 6 : 2}>
            {detail}
          </ThemedText>
        )}
      </View>
      {running ? (
        <HeaderButton
          icon="close"
          label={t('general.cancel')}
          onPress={() => cancelTransfer(transfer.id)}
        />
      ) : (status === 'error' || status === 'cancelled') && transfer.retryable ? (
        <HeaderButton
          icon="refresh"
          label={t('general.retry')}
          color={theme.primary}
          onPress={() => retryTransfer(transfer.id)}
        />
      ) : status === 'done' ? (
        <Icon name="check_circle" color={direction} />
      ) : null}
    </View>
  );
}

function finishedTime(transfer: Transfer) {
  if (!transfer.finishedAt) return '';
  return new Date(transfer.finishedAt).toLocaleTimeString(formatLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  numbers: { fontVariant: ['tabular-nums'] },
  list: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.six },
  sectionTitle: { marginTop: Spacing.two, marginBottom: Spacing.one },
  summary: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statLine: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: Radius.medium,
    borderLeftWidth: 3,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  route: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  track: { height: 4, borderRadius: 2, marginVertical: Spacing.one, overflow: 'hidden' },
  bar: { height: 4 },
});
