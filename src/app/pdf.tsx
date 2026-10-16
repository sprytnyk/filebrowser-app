import { type File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { type FileItem } from '@/api/types';
import { PdfPages } from '@/components/files/pdf-pages';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { HeaderButton } from '@/components/ui/header-button';
import { ToastHost } from '@/components/ui/toast-host';
import { Spacing } from '@/constants/theme';
import { openWith } from '@/hooks/use-open-file';
import { useTheme } from '@/hooks/use-theme';
import { formatSize } from '@/lib/files';
import { errorMessage, showError } from '@/lib/notify';
import { pdfErrorKind } from '@/lib/pdf';
import { getViewerItems } from '@/lib/viewer-store';
import { useSelf } from '@/session/session';
import { downloadForView, downloadItems } from '@/transfers/download';
import { cancelTransfer, isRunning, useTransfers } from '@/transfers/store';

/**
 * Shows a PDF inside the app. The file is fetched once and kept in the cache, so opening it
 * again (until it changes on the server) needs no download.
 */
export default function PdfScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const params = useLocalSearchParams<{ source: string; path: string }>();
  const { data: self } = useSelf();
  const [item] = useState<FileItem | undefined>(() =>
    getViewerItems().find((i) => i.source === params.source && i.path === params.path),
  );
  const [file, setFile] = useState<File | null>(null);
  /** Why the PDF isn't showing: download failed or cancelled, or the file can't be drawn. */
  const [failure, setFailure] = useState<{ error: unknown } | 'cancelled' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [transferId, setTransferId] = useState<string | null>(null);
  const transfer = useTransfers().find((x) => x.id === transferId);
  const canDownload = !!self?.scopes.find((s) => s.name === item?.source)?.permissions.download;

  useEffect(() => {
    if (!item) router.back();
  }, [item]);

  useEffect(() => {
    if (!item) return;
    let live = true;
    let id: string | null = null;
    downloadForView(item, (started) => {
      id = started;
      setTransferId(started);
    }).then(
      // Null when the download was cancelled from the Transfers tab.
      (f) => live && (f ? setFile(f) : setFailure('cancelled')),
      (error) => live && setFailure({ error }),
    );
    return () => {
      live = false;
      // Leaving before it arrives: nobody asked to keep this download.
      if (id) cancelTransfer(id);
    };
  }, [item, attempt]);

  const onPdfError = useCallback((error: unknown) => setFailure({ error }), []);

  if (!item) return null;

  const failureText = (f: NonNullable<typeof failure>) => {
    if (f === 'cancelled') return t('mobile.cancelled');
    const kind = pdfErrorKind(f.error);
    if (kind === 'password') return t('mobile.pdfPassword');
    if (kind === 'invalid') return t('mobile.pdfInvalid');
    return errorMessage(f.error);
  };

  const openElsewhere = () => {
    if (file) void openWith(file, item).catch(showError);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: item.name,
          headerRight: () => (
            <View style={styles.row}>
              {file ? (
                <HeaderButton
                  icon="open_in_new"
                  label={t('mobile.openWith')}
                  onPress={openElsewhere}
                />
              ) : null}
              {canDownload ? (
                <HeaderButton
                  icon="download"
                  label={t('general.download')}
                  onPress={() => void downloadItems([item])}
                />
              ) : null}
              {self?.permissions.share ? (
                <HeaderButton
                  icon="share"
                  label={t('general.share')}
                  onPress={() =>
                    router.push({
                      pathname: '/share-create',
                      params: { source: item.source, path: item.path, name: item.name },
                    })
                  }
                />
              ) : null}
            </View>
          ),
        }}
      />
      {failure ? (
        <View style={styles.center}>
          <ThemedText style={styles.text}>{failureText(failure)}</ThemedText>
          {file ? (
            <Button title={t('mobile.openWith')} icon="open_in_new" onPress={openElsewhere} />
          ) : (
            <Button
              title={t('general.retry')}
              icon="refresh"
              onPress={() => {
                setFailure(null);
                setAttempt((n) => n + 1);
              }}
            />
          )}
        </View>
      ) : file ? (
        <PdfPages uri={file.uri} onError={onPdfError} />
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
          {transfer && isRunning(transfer) && transfer.total > 0 ? (
            <ThemedText type="caption" style={styles.text}>
              {formatSize(transfer.loaded)} / {formatSize(transfer.total)}
            </ThemedText>
          ) : null}
        </View>
      )}
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  text: { textAlign: 'center' },
});
