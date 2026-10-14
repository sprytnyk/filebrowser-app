import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { listShares } from '@/api/share';
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
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/notify';
import { activeFirst, expiryText, hasPassword, isExpired, shareName } from '@/lib/shares';
import { parentDir } from '@/lib/url';
import { useSelf } from '@/session/session';

export default function SharesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: self } = useSelf();
  const shares = useQuery({
    queryKey: ['shares'],
    queryFn: listShares,
    enabled: !!self?.permissions.share,
  });

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
        data={activeFirst(shares.data ?? [], shares.dataUpdatedAt)}
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
        renderItem={({ item }) => {
          const expired = isExpired(item, shares.dataUpdatedAt);
          const folder = !item.singleFileShare;
          return (
            <View style={[styles.card, { backgroundColor: theme.surfacePrimary }]}>
              <View style={styles.header}>
                <Icon
                  name={folder ? 'folder' : 'insert_drive_file'}
                  color={item.pathExists ? theme.primary : theme.danger}
                  style={expired && styles.dimmed}
                />
                <View style={[styles.flex, expired && styles.dimmed]}>
                  <ThemedText numberOfLines={1}>{shareName(item)}</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                    {item.source}:{item.path}
                  </ThemedText>
                  <View style={styles.meta}>
                    <ThemedText
                      type="caption"
                      themeColor={expired ? 'danger' : 'textSecondary'}
                      numberOfLines={1}>
                      {expired ? t('mobile.expired') : expiryText(item, t, shares.dataUpdatedAt)}
                    </ThemedText>
                    {hasPassword(item) ? (
                      <>
                        <Icon name="lock" size={14} color={theme.textSecondary} />
                        <ThemedText type="caption" themeColor="textSecondary">
                          {t('mobile.passwordProtected')}
                        </ThemedText>
                      </>
                    ) : null}
                  </View>
                </View>
                {/* Up here rather than beside the chips, which need the full width in longer
                    languages. Not dimmed: expired shares are the ones most often deleted. */}
                {item.canEditShare ? (
                  <HeaderButton
                    icon="delete"
                    label={t('general.delete')}
                    color={theme.danger}
                    onPress={() => void actions.remove(item)}
                  />
                ) : null}
                <HeaderButton
                  icon="more_vert"
                  label={t('general.actions')}
                  onPress={() => setSheetShare(item)}
                />
              </View>
              {/* Wraps onto a second line only if a translation is too long for one. */}
              <View style={styles.chips}>
                <ChipButton
                  icon="link"
                  label={t('mobile.linkShort')}
                  accessibilityLabel={t('buttons.copyToClipboard')}
                  onPress={() => void actions.copy(item.shareURL)}
                />
                {item.downloadURL ? (
                  <ChipButton
                    icon={folder ? 'folder_zip' : 'download'}
                    label={folder ? t('mobile.zipShort') : t('mobile.fileShort')}
                    accessibilityLabel={
                      folder ? t('mobile.copyArchiveLink') : t('mobile.copyDownloadLink')
                    }
                    onPress={() => void actions.copy(item.downloadURL)}
                  />
                ) : null}
                <ChipButton
                  icon="share"
                  label={t('general.share')}
                  onPress={() => void actions.send(item.shareURL, shareName(item))}
                />
              </View>
            </View>
          );
        }}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.six },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: Radius.medium,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dimmed: { opacity: 0.55 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
