import { router, Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { type ShareLink } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionSheet, type SheetAction } from '@/components/ui/action-sheet';
import { Banner } from '@/components/ui/banner';
import { ChipButton } from '@/components/ui/chip-button';
import { HeaderButton } from '@/components/ui/header-button';
import { Icon } from '@/components/ui/icon';
import { ToastHost } from '@/components/ui/toast-host';
import { Radius, Spacing } from '@/constants/theme';
import { useShareActions } from '@/hooks/use-share-actions';
import { useShares } from '@/hooks/use-shares';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/notify';
import { kindFromName, kindIcon } from '@/lib/files';
import {
  byCreated,
  createdDate,
  expiryDate,
  expiresSoon,
  expiryText,
  hasPassword,
  isExpired,
  shareName,
} from '@/lib/shares';
import { parentDir } from '@/lib/url';
import { useSelf } from '@/session/session';

export default function SharesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: self } = useSelf();
  const shares = useShares();
  // Tabs stay mounted, so reload on every visit: links made in the web UI or deleted there
  // would otherwise only show after a pull to refresh.
  const { refetch } = shares;
  useFocusEffect(
    useCallback(() => {
      void refetch({ cancelRefetch: false });
    }, [refetch]),
  );

  const [sheetShare, setSheetShare] = useState<ShareLink | null>(null);

  const actions = useShareActions();

  /** Less frequent actions; copy, share and delete sit on the card itself. */
  function shareActions(share: ShareLink): SheetAction[] {
    return [
      { id: 'open', title: t('general.openFile'), icon: 'open_in_new' as const },
      ...(share.pathExists
        ? [{ id: 'goto', title: t('buttons.goToItem'), icon: 'folder_open' as const }]
        : []),
    ];
  }

  function onAction(share: ShareLink, action: string) {
    switch (action) {
      case 'open':
        return void actions.open(share.shareURL);
      case 'goto':
        return router.navigate({
          pathname: '/files/[source]',
          params: {
            source: share.source,
            path: share.singleFileShare ? parentDir(share.path) : share.path,
          },
        });
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: t('general.shareManagement') }} />
      {!self?.permissions.share && self ? (
        <View style={styles.pad}>
          <Banner kind="info" message={t('errors.forbidden')} />
        </View>
      ) : null}
      {shares.error ? (
        <View style={styles.pad}>
          <Banner kind="error" message={errorMessage(shares.error)} />
        </View>
      ) : null}
      <FlatList
        data={byCreated(shares.data ?? [], shares.dataUpdatedAt)}
        keyExtractor={(s) => s.hash}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={shares.isRefetching}
            onRefresh={() => void shares.refetch()}
            colors={[theme.primary]}
          />
        }
        ListEmptyComponent={
          shares.isPending ? null : (
            <View style={styles.empty}>
              <Icon name="share" size={48} color={theme.textSecondary} />
              <ThemedText themeColor="textSecondary">{t('files.lonely')}</ThemedText>
            </View>
          )
        }
        renderItem={({ item }) => (
          <ShareRow
            share={item}
            now={shares.dataUpdatedAt}
            onDelete={() => void actions.remove(item)}
            onMore={() => setSheetShare(item)}
            onCopy={(url) => void actions.copy(url)}
            onSend={() => void actions.send(item.shareURL, shareName(item))}
          />
        )}
      />
      <ActionSheet
        visible={sheetShare !== null}
        title={sheetShare ? shareName(sheetShare) : undefined}
        subtitle={sheetShare?.shareURL}
        actions={sheetShare ? shareActions(sheetShare) : []}
        onClose={() => setSheetShare(null)}
        onSelect={(id) => {
          if (sheetShare) onAction(sheetShare, id);
        }}
      />
      <ToastHost />
    </ThemedView>
  );
}

type ShareRowProps = {
  share: ShareLink;
  /** When the list was fetched, so expiry states match the data rather than the clock. */
  now: number;
  onDelete: () => void;
  onMore: () => void;
  onCopy: (url: string) => void;
  onSend: () => void;
};

/** Laid out like a transfer row: a tinted edge and badge for the kind, then the details. */
function ShareRow({ share, now, onDelete, onMore, onCopy, onSend }: ShareRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const folder = !share.singleFileShare;
  const expired = isExpired(share, now);
  const soon = expiresSoon(share, now);
  const missing = !share.pathExists;
  const created = createdDate(share);
  const icon = kindIcon(kindFromName(shareName(share), folder));

  // The item's kind color, unless the link is dead: red when the item is gone, gray once expired.
  const [tint, tintBackground] = missing
    ? [theme.danger, theme.errorBackground]
    : expired
      ? [theme.textSecondary, theme.surfaceSecondary]
      : [icon.color, `${icon.color}26`];

  const [expiryIcon, expiryColor, expiryLabel] = expired
    ? (['timer_off', 'danger', `${t('mobile.expired')} · ${expiryDate(share)}`] as const)
    : !share.expire
      ? (['all_inclusive', 'textSecondary', expiryText(share, t, now)] as const)
      : ([
          soon ? 'alarm' : 'schedule',
          soon ? 'warning' : 'textSecondary',
          expiryText(share, t, now),
        ] as const);

  return (
    <View style={[styles.row, { backgroundColor: theme.surfacePrimary, borderLeftColor: tint }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: tintBackground }]}>
          <Icon name={missing ? 'link_off' : icon.name} color={tint} />
        </View>
        <View style={[styles.flex, expired && styles.dimmed]}>
          <ThemedText numberOfLines={1}>{shareName(share)}</ThemedText>
          <View style={styles.line}>
            <Icon
              name={folder ? 'folder_open' : 'description'}
              size={14}
              color={theme.textSecondary}
            />
            <ThemedText
              type="caption"
              themeColor="textSecondary"
              numberOfLines={1}
              ellipsizeMode="middle"
              style={styles.shrink}>
              {share.source}:{share.path}
            </ThemedText>
          </View>
        </View>
        {/* Up here rather than beside the chips, which need the full width in longer
            languages. Not dimmed: expired shares are the ones most often deleted. */}
        {share.canEditShare ? (
          <HeaderButton
            icon="delete"
            label={t('general.delete')}
            color={theme.danger}
            onPress={onDelete}
          />
        ) : null}
        <HeaderButton icon="more_vert" label={t('general.actions')} onPress={onMore} />
      </View>
      <View style={styles.details}>
        {created ? (
          <View style={styles.line}>
            <Icon name="add_link" size={14} color={theme.textSecondary} />
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {t('mobile.shareCreatedOn', { date: created })}
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.line}>
          <Icon name={expiryIcon} size={14} color={theme[expiryColor]} />
          <ThemedText
            type="caption"
            themeColor={expiryColor}
            numberOfLines={1}
            style={styles.shrink}>
            {expiryLabel}
          </ThemedText>
          {hasPassword(share) ? (
            <>
              <Icon name="lock" size={14} color={theme.textSecondary} />
              <ThemedText type="caption" themeColor="textSecondary">
                {t('mobile.passwordProtected')}
              </ThemedText>
            </>
          ) : null}
        </View>
        {missing ? (
          <View style={styles.line}>
            <Icon name="warning" size={14} color={theme.danger} />
            <ThemedText type="caption" themeColor="danger" numberOfLines={2} style={styles.shrink}>
              {t('mobile.sharePathMissing')}
            </ThemedText>
          </View>
        ) : null}
        {/* Wraps onto a second line only if a translation is too long for one. */}
        <View style={styles.chips}>
          <ChipButton
            icon="link"
            label={t('mobile.linkShort')}
            accessibilityLabel={t('buttons.copyToClipboard')}
            onPress={() => onCopy(share.shareURL)}
          />
          {share.downloadURL ? (
            <ChipButton
              icon={folder ? 'folder_zip' : 'download'}
              label={folder ? t('mobile.zipShort') : t('mobile.fileShort')}
              accessibilityLabel={
                folder ? t('mobile.copyArchiveLink') : t('mobile.copyDownloadLink')
              }
              onPress={() => onCopy(share.downloadURL)}
            />
          ) : null}
          <ChipButton icon="share" label={t('general.share')} onPress={onSend} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  pad: { padding: Spacing.three },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.six },
  row: {
    gap: Spacing.two,
    padding: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: Radius.medium,
    borderLeftWidth: 3,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lines up with the name, past the badge.
  details: { gap: Spacing.two, paddingLeft: 40 + Spacing.three },
  dimmed: { opacity: 0.55 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
