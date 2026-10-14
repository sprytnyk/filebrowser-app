import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ApiError } from '@/api/client';
import { getListing, search, searchResultToItem } from '@/api/resources';
import { listShares } from '@/api/share';
import { type FileItem, type SourcePermissions } from '@/api/types';
import { Breadcrumbs } from '@/components/files/breadcrumbs';
import { FileRow } from '@/components/files/file-row';
import { FileTile } from '@/components/files/file-tile';
import { ServerSwitchButton, useServerName } from '@/components/servers/server-switcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionSheet, type SheetAction, useActionSheet } from '@/components/ui/action-sheet';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Fab } from '@/components/ui/fab';
import { HeaderButton } from '@/components/ui/header-button';
import { HeaderTitle } from '@/components/ui/header-title';
import { Icon } from '@/components/ui/icon';
import { TextPrompt } from '@/components/ui/text-prompt';
import { ToastHost } from '@/components/ui/toast-host';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useFileActions, useInvalidateListing } from '@/hooks/use-file-actions';
import { useOpenFile } from '@/hooks/use-open-file';
import { useTheme } from '@/hooks/use-theme';
import { ask } from '@/lib/dialog';
import { formatDate, formatSize, isValidName, sortItems } from '@/lib/files';
import { errorMessage } from '@/lib/notify';
import { itemKey, sharedKeys } from '@/lib/shares';
import { baseName, parentDir } from '@/lib/url';
import { setPrefs, type SortBy, usePrefs } from '@/session/prefs';
import { useSelf, useServer } from '@/session/session';
import { announceTransfers } from '@/transfers/announce';
import { downloadItems } from '@/transfers/download';
import { type PickedFile, pickDocuments, pickMedia, uploadFiles } from '@/transfers/upload';

const NO_PERMS: SourcePermissions = {
  view: true,
  download: false,
  modify: false,
  delete: false,
  create: false,
};

type Prompt = { kind: 'newFolder' } | { kind: 'rename'; item: FileItem } | null;

export default function FolderScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const server = useServer();
  const prefs = usePrefs();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ source: string; path?: string }>();
  const source = params.source;
  const dir = params.path ? (params.path.endsWith('/') ? params.path : `${params.path}/`) : '/';

  const { data: self, refetch: refetchSelf } = useSelf();
  const perms = self?.scopes.find((s) => s.name === source)?.permissions ?? NO_PERMS;
  // With a single source this is the first screen of the tab (the source list is skipped), so
  // its header has no back button and room for the server switcher.
  const stackRoot = dir === '/' && self?.scopes.length === 1;
  const serverName = useServerName();
  const canShare = !!self?.permissions.share;
  const shares = useQuery({ queryKey: ['shares'], queryFn: listShares, enabled: canShare });
  const shared = useMemo(
    () => sharedKeys(shares.data ?? [], self?.username),
    [shares.data, self?.username],
  );

  const listing = useQuery({
    queryKey: ['listing', source, dir],
    queryFn: () => getListing(source, dir),
  });
  const invalidate = useInvalidateListing();
  const actions = useFileActions();
  const openFile = useOpenFile();

  const [filter, setFilter] = useState('');
  const query = useDebounced(filter.trim(), 350);
  const searching = query.length >= server.minSearchLength;
  const results = useQuery({
    queryKey: ['search', source, dir, query],
    queryFn: ({ signal }) => search(source, dir, query, signal),
    enabled: searching,
    retry: false,
  });
  // Users without the search tool get 403; fall back to filtering this folder.
  const serverSearch = searching && !(results.error instanceof ApiError);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const selecting = selected.size > 0;
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [sheetItem, setSheetItem] = useState<FileItem | null>(null);
  const [infoItem, setInfoItem] = useState<FileItem | null>(null);
  const menu = useActionSheet();

  const items = useMemo(() => {
    if (serverSearch) return (results.data ?? []).map((r) => searchResultToItem(r, dir));
    const all = listing.data?.items ?? [];
    const visible = self?.showHidden ? all : all.filter((i) => !i.hidden);
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? visible.filter((i) => i.name.toLowerCase().includes(needle))
      : visible;
    return sortItems(matching, prefs.sortBy, prefs.sortAsc);
  }, [
    serverSearch,
    results.data,
    dir,
    listing.data,
    self?.showHidden,
    filter,
    prefs.sortBy,
    prefs.sortAsc,
  ]);

  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.path)), [items, selected]);

  const toggle = useCallback((item: FileItem) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const openItem = useCallback(
    (item: FileItem) => {
      if (selecting) {
        toggle(item);
        return;
      }
      if (item.isDir) {
        router.push({
          pathname: '/files/[source]',
          params: { source: item.source, path: item.path },
        });
      } else {
        openFile(item, items);
      }
    },
    [items, openFile, selecting, toggle],
  );

  const goTo = useCallback(
    (path: string) => router.push({ pathname: '/files/[source]', params: { source, path } }),
    [source],
  );

  async function startUpload(pick: () => Promise<PickedFile[]>) {
    const picked = await pick();
    if (picked.length === 0) return;
    const existing = new Set((listing.data?.items ?? []).map((i) => i.name));
    const conflicts = picked.filter((p) => existing.has(p.name));
    let files = picked;
    let overwrite = false;
    if (conflicts.length > 0) {
      const choice = await ask({
        title: t('general.conflict'),
        message: t('mobile.uploadConflict', { count: conflicts.length }),
        buttons: [
          { id: 'cancel', label: t('general.cancel'), kind: 'cancel' },
          { id: 'skip', label: t('mobile.skip') },
          { id: 'replace', label: t('general.replace'), kind: 'destructive' },
        ],
      });
      if (choice === null) return;
      if (choice === 'cancel') return;
      if (choice === 'skip') files = picked.filter((p) => !existing.has(p.name));
      overwrite = choice === 'replace';
    }
    if (files.length === 0) return;
    uploadFiles(
      files,
      {
        source,
        dir,
        overwrite,
        chunkSizeMb: self?.fileLoading.uploadChunkSizeMb ?? 10,
      },
      () => void invalidate(source, dir),
    );
    announceTransfers(files.length);
  }

  function infoDetails(item: FileItem) {
    return [
      { label: t('general.path'), value: `${item.source}:${item.path}` },
      item.isDir ? null : { label: t('general.size'), value: formatSize(item.size) },
      { label: t('files.lastModified'), value: formatDate(item.modified) },
      item.isDir ? null : { label: t('general.type'), value: item.type },
    ].filter((d): d is { label: string; value: string } => d !== null);
  }

  function itemActions(item: FileItem): SheetAction[] {
    const all: (SheetAction & { hidden?: boolean })[] = [
      {
        id: 'open',
        title: t('general.openFile'),
        icon: item.isDir ? 'folder_open' : 'open_in_new',
      },
      { id: 'download', title: t('general.download'), icon: 'download', hidden: !perms.download },
      shared.has(itemKey(item))
        ? { id: 'share', title: t('mobile.manageShare'), icon: 'link', hidden: !canShare }
        : { id: 'share', title: t('general.share'), icon: 'share', hidden: !canShare },
      {
        id: 'rename',
        title: t('general.rename'),
        icon: 'drive_file_rename_outline',
        hidden: !perms.modify,
      },
      {
        id: 'move',
        title: t('general.move'),
        icon: 'drive_file_move',
        hidden: !perms.modify || !perms.delete,
      },
      { id: 'copy', title: t('general.copy'), icon: 'content_copy' },
      { id: 'select', title: t('general.select'), icon: 'check_circle' },
      { id: 'info', title: t('general.info'), icon: 'info' },
      {
        id: 'delete',
        title: t('general.delete'),
        icon: 'delete',
        destructive: true,
        hidden: !perms.delete,
      },
    ];
    return all.filter((a) => !a.hidden);
  }

  function onItemAction(item: FileItem, action: string) {
    switch (action) {
      case 'open':
        return openItem(item);
      case 'info':
        return setInfoItem(item);
      case 'download':
        return void downloadItems([item]);
      case 'share':
        return router.push({
          pathname: '/share-create',
          params: { source: item.source, path: item.path, name: item.name },
        });
      case 'rename':
        return setPrompt({ kind: 'rename', item });
      case 'move':
      case 'copy':
        return actions.startTransfer(action, [item]);
      case 'select':
        return toggle(item);
      case 'delete':
        return void actions.remove([item]);
    }
  }

  async function onSelectionAction(action: string) {
    const chosen = selectedItems;
    switch (action) {
      case 'download':
        await downloadItems(chosen);
        clearSelection();
        return;
      case 'move':
      case 'copy':
        actions.startTransfer(action, chosen);
        clearSelection();
        return;
      case 'delete':
        if (await actions.remove(chosen)) clearSelection();
        return;
      case 'all':
        setSelected(new Set(items.map((i) => i.path)));
        return;
      case 'share':
      case 'rename':
      case 'info':
        if (chosen.length === 1) onItemAction(chosen[0], action);
        clearSelection();
        return;
    }
  }

  const sortActions: { id: SortBy; title: string }[] = [
    { id: 'name', title: t('files.sortByName') },
    { id: 'size', title: t('files.sortBySize') },
    { id: 'modified', title: t('files.sortByLastModified') },
  ];

  const title = selecting
    ? t('mobile.selectedCount', { count: selected.size })
    : stackRoot
      ? serverName
      : dir === '/'
        ? source
        : baseName(dir);

  const columns = Math.max(3, Math.floor(width / 128));
  const tileSize = Math.floor((width - Spacing.two * 2) / columns);
  const isGrid = prefs.viewMode === 'grid';

  const header = (
    <Stack.Screen
      options={{
        title,
        // At the top of a single-source server, name the server and show the source under it.
        headerTitle:
          stackRoot && !selecting
            ? () => <HeaderTitle title={serverName} subtitle={source} />
            : undefined,
        headerLeft: selecting
          ? () => (
              <HeaderButton
                icon="close"
                label={t('general.clearSelection')}
                onPress={clearSelection}
              />
            )
          : stackRoot
            ? () => <ServerSwitchButton />
            : undefined,
        headerRight: () =>
          selecting ? (
            <View style={styles.headerActions}>
              {perms.download ? (
                <HeaderButton
                  icon="download"
                  label={t('general.download')}
                  onPress={() => void onSelectionAction('download')}
                />
              ) : null}
              {selected.size === 1 && canShare ? (
                <HeaderButton
                  icon="share"
                  label={t('general.share')}
                  onPress={() => void onSelectionAction('share')}
                />
              ) : null}
              {perms.delete ? (
                <HeaderButton
                  icon="delete"
                  label={t('general.delete')}
                  color={theme.danger}
                  onPress={() => void onSelectionAction('delete')}
                />
              ) : null}
              <HeaderButton
                icon="more_vert"
                label={t('general.actions')}
                onPress={() =>
                  menu.open({
                    title,
                    actions: [
                      { id: 'all', title: t('buttons.selectAll'), icon: 'select_all' },
                      ...(selected.size === 1
                        ? [
                            ...(perms.modify
                              ? [
                                  {
                                    id: 'rename',
                                    title: t('general.rename'),
                                    icon: 'drive_file_rename_outline' as const,
                                  },
                                ]
                              : []),
                            { id: 'info', title: t('general.info'), icon: 'info' as const },
                          ]
                        : []),
                      { id: 'copy', title: t('general.copy'), icon: 'content_copy' },
                      ...(perms.modify && perms.delete
                        ? [
                            {
                              id: 'move',
                              title: t('general.move'),
                              icon: 'drive_file_move' as const,
                            },
                          ]
                        : []),
                    ],
                    onSelect: (id) => void onSelectionAction(id),
                  })
                }
              />
            </View>
          ) : (
            <View style={styles.headerActions}>
              <HeaderButton
                icon={isGrid ? 'view_list' : 'grid_view'}
                label={t('buttons.switchView')}
                onPress={() => setPrefs({ viewMode: isGrid ? 'list' : 'grid' })}
              />
              <HeaderButton
                icon="sort"
                label={t('files.sortByName')}
                onPress={() =>
                  menu.open({
                    title: t('mobile.sortBy'),
                    subtitle: prefs.sortAsc ? t('mobile.ascending') : t('mobile.descending'),
                    actions: sortActions.map((a) => ({ ...a, checked: prefs.sortBy === a.id })),
                    // Picking the current key again flips the direction.
                    onSelect: (id) => {
                      const by = id as SortBy;
                      setPrefs(
                        by === prefs.sortBy
                          ? { sortAsc: !prefs.sortAsc }
                          : { sortBy: by, sortAsc: by === 'name' },
                      );
                    },
                  })
                }
              />
            </View>
          ),
        headerSearchBarOptions: {
          placeholder: t('general.search'),
          textColor: theme.text,
          hintTextColor: theme.textSecondary,
          headerIconColor: theme.text,
          tintColor: theme.primary,
          autoCapitalize: 'none',
          onChangeText: (e) => setFilter(e.nativeEvent.text),
          onCancelButtonPress: () => setFilter(''),
          onClose: () => setFilter(''),
        },
      }}
    />
  );

  const error = listing.error;
  const searchHint =
    filter.trim().length > 0 && !searching
      ? t('search.notEnoughCharacters', { minSearchLength: server.minSearchLength })
      : null;

  return (
    <ThemedView style={styles.flex}>
      {header}
      <Breadcrumbs source={source} path={dir} onNavigate={goTo} />
      {error ? (
        <View style={styles.message}>
          <Banner kind="error" message={errorMessage(error)} />
          <Button
            title={t('buttons.refresh')}
            variant="secondary"
            onPress={() => void listing.refetch()}
          />
        </View>
      ) : null}
      {searchHint && !serverSearch ? (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.hint}>
          {searchHint}
        </ThemedText>
      ) : null}
      <FlashList
        key={isGrid ? `grid-${columns}` : 'list'}
        data={items}
        numColumns={isGrid ? columns : 1}
        keyExtractor={(item) => `${item.source}:${item.path}`}
        contentContainerStyle={isGrid ? styles.grid : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={listing.isRefetching}
            onRefresh={() => {
              void listing.refetch();
              void refetchSelf();
            }}
            colors={[theme.primary]}
          />
        }
        ListEmptyComponent={
          listing.isPending || (serverSearch && results.isPending) ? null : (
            <View style={styles.empty}>
              <Icon
                name={serverSearch ? 'search' : 'folder_open'}
                size={48}
                color={theme.textSecondary}
              />
              <ThemedText themeColor="textSecondary">
                {serverSearch || filter ? t('search.noResults') : t('files.lonely')}
              </ThemedText>
            </View>
          )
        }
        renderItem={({ item }) =>
          isGrid ? (
            <FileTile
              item={item}
              size={tileSize}
              selected={selected.has(item.path)}
              selecting={selecting}
              onPress={() => openItem(item)}
              onLongPress={() => toggle(item)}
            />
          ) : (
            <FileRow
              item={item}
              selected={selected.has(item.path)}
              selecting={selecting}
              onPress={() => openItem(item)}
              onLongPress={() => toggle(item)}
              subtitle={serverSearch ? parentDir(item.path) : undefined}
              accessory={
                <View style={styles.accessory}>
                  {shared.has(itemKey(item)) ? (
                    <HeaderButton
                      icon="link"
                      label={t('mobile.manageShare')}
                      color={theme.primary}
                      onPress={() => onItemAction(item, 'share')}
                    />
                  ) : null}
                  <HeaderButton
                    icon="more_vert"
                    label={t('general.actions')}
                    onPress={() => setSheetItem(item)}
                  />
                </View>
              }
            />
          )
        }
      />
      {perms.create && !selecting ? (
        <Fab
          icon="add"
          label={t('general.new')}
          onPress={() =>
            menu.open({
              title: `${source}:${dir}`,
              actions: [
                { id: 'files', title: t('mobile.uploadFiles'), icon: 'upload_file' },
                { id: 'media', title: t('mobile.uploadMedia'), icon: 'photo_library' },
                { id: 'folder', title: t('files.newFolder'), icon: 'create_new_folder' },
              ],
              onSelect: (id) => {
                if (id === 'files') void startUpload(pickDocuments);
                else if (id === 'media') void startUpload(pickMedia);
                else setPrompt({ kind: 'newFolder' });
              },
            })
          }
        />
      ) : null}
      <ActionSheet
        visible={sheetItem !== null}
        title={sheetItem?.name}
        subtitle={
          sheetItem
            ? [sheetItem.isDir ? null : formatSize(sheetItem.size), formatDate(sheetItem.modified)]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        actions={sheetItem ? itemActions(sheetItem) : []}
        onClose={() => setSheetItem(null)}
        onSelect={(id) => {
          if (sheetItem) onItemAction(sheetItem, id);
        }}
      />
      {menu.sheet}
      <ActionSheet
        visible={infoItem !== null}
        title={infoItem?.name}
        subtitle={t('prompts.fileInfo')}
        details={infoItem ? infoDetails(infoItem) : []}
        actions={[]}
        onClose={() => setInfoItem(null)}
        onSelect={() => {}}
      />
      <TextPrompt
        visible={prompt !== null}
        title={prompt?.kind === 'rename' ? t('general.rename') : t('files.newFolder')}
        label={prompt?.kind === 'rename' ? t('prompts.renameMessage') : t('files.newFolderMessage')}
        initialValue={prompt?.kind === 'rename' ? prompt.item.name : ''}
        submitLabel={prompt?.kind === 'rename' ? t('general.rename') : t('general.create')}
        cancelLabel={t('general.cancel')}
        validate={(value) => {
          if (!isValidName(value)) return t('prompts.renameMessageInvalid');
          const taken = (listing.data?.items ?? []).some((i) => i.name === value.trim());
          return taken ? t('prompts.renameMessageConflict', { filename: value.trim() }) : null;
        }}
        onCancel={() => setPrompt(null)}
        onSubmit={async (value) => {
          const current = prompt;
          setPrompt(null);
          if (current?.kind === 'rename') await actions.rename(current.item, value);
          else await actions.createFolder(source, dir, value);
        }}
      />
      <ToastHost aboveFab={perms.create && !selecting} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  accessory: { flexDirection: 'row', alignItems: 'center' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  list: {
    paddingBottom: 96,
  },
  grid: {
    paddingHorizontal: Spacing.two,
    paddingBottom: 96,
  },
  message: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  hint: {
    paddingHorizontal: Spacing.three,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.six,
  },
});
