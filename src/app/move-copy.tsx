import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getListing, moveCopy } from '@/api/resources';
import { Breadcrumbs } from '@/components/files/breadcrumbs';
import { FileRow } from '@/components/files/file-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActionSheet } from '@/components/ui/action-sheet';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { HeaderButton } from '@/components/ui/header-button';
import { ToastHost } from '@/components/ui/toast-host';
import { Spacing } from '@/constants/theme';
import { useInvalidateListing } from '@/hooks/use-file-actions';
import { useTheme } from '@/hooks/use-theme';
import { sortItems } from '@/lib/files';
import { getPendingTransfer, setPendingTransfer } from '@/lib/move-store';
import { errorMessage, showError, toast } from '@/lib/notify';
import { parentDir } from '@/lib/url';
import { useSelf } from '@/session/session';

export default function MoveCopyScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source: string; path: string }>();
  const [pending] = useState(getPendingTransfer);
  const [source, setSource] = useState(params.source);
  const [dir, setDir] = useState(params.path || '/');
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateListing();
  const { data: self } = useSelf();
  const menu = useActionSheet();

  const listing = useQuery({
    queryKey: ['listing', source, dir],
    queryFn: () => getListing(source, dir),
  });
  const folders = sortItems(
    (listing.data?.items ?? []).filter((i) => i.isDir),
    'name',
    true,
  );
  const writableSources = (self?.scopes ?? []).filter((s) => s.permissions.create);
  const canWriteHere = writableSources.some((s) => s.name === source);

  if (!pending) {
    return (
      <ThemedView style={[styles.flex, styles.pad]}>
        <Banner kind="error" message={t('prompts.error')} />
      </ThemedView>
    );
  }
  const { mode, items } = pending;

  // A folder can't go into itself or its own subtree, and items can't move to where they are.
  const intoItself = items.some((i) => i.isDir && i.source === source && dir.startsWith(i.path));
  const sameFolder = items.every((i) => i.source === source && parentDir(i.path) === dir);
  const blocked = intoItself || (mode === 'move' && sameFolder);

  async function submit() {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await moveCopy(
        items.map((i) => ({
          fromSource: i.source,
          fromPath: i.path,
          toSource: source,
          toPath: `${dir}${i.name}`,
        })),
        mode,
      );
      if (result.failed.length > 0) {
        showError(
          new Error(result.failed.map((f) => `${f.fromPath}: ${f.message ?? ''}`).join('\n')),
          mode === 'move' ? t('prompts.moveFailed') : t('general.error'),
        );
      } else {
        toast(mode === 'move' ? t('prompts.moveSuccess') : t('prompts.copySuccess'));
      }
      setPendingTransfer(null);
      await invalidate();
      router.back();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'move' ? t('buttons.moveFile') : t('buttons.copyFile');

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            writableSources.length > 1 ? (
              <HeaderButton
                icon="storage"
                label={t('prompts.destinationSource')}
                onPress={() =>
                  menu.open({
                    title: t('prompts.destinationSource'),
                    actions: writableSources.map((s) => ({
                      id: s.name,
                      title: s.name,
                      icon: 'storage' as const,
                      checked: s.name === source,
                    })),
                    onSelect: (id) => {
                      setSource(id);
                      setDir('/');
                    },
                  })
                }
              />
            ) : null,
        }}
      />
      {menu.sheet}
      <Breadcrumbs source={source} path={dir} onNavigate={setDir} />
      {listing.error ? (
        <View style={styles.pad}>
          <Banner kind="error" message={errorMessage(listing.error)} />
        </View>
      ) : null}
      <FlatList
        data={folders}
        keyExtractor={(f) => f.path}
        ListEmptyComponent={
          listing.isPending ? null : (
            <ThemedText themeColor="textSecondary" style={styles.pad}>
              {t('files.lonely')}
            </ThemedText>
          )
        }
        renderItem={({ item }) => (
          <FileRow
            item={item}
            selected={false}
            selecting={false}
            onPress={() => setDir(item.path)}
            onLongPress={() => setDir(item.path)}
          />
        )}
      />
      <View
        style={[
          styles.footer,
          { borderColor: theme.divider, paddingBottom: Spacing.three + insets.bottom },
        ]}>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {t('prompts.destinationPath')} {source}:{dir}
        </ThemedText>
        {intoItself || (mode === 'move' && sameFolder) ? (
          <ThemedText type="caption" themeColor="danger">
            {t('files.sameFolder')}
          </ThemedText>
        ) : null}
        <Button
          title={`${mode === 'move' ? t('general.move') : t('general.copy')} (${items.length})`}
          icon={mode === 'move' ? 'drive_file_move' : 'content_copy'}
          loading={busy}
          disabled={blocked || !canWriteHere}
          onPress={submit}
        />
      </View>
      <ToastHost />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
