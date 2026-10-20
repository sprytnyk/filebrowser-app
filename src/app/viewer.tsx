import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authHeaders, getBaseUrl } from '@/api/client';
import { previewUrl, rawUrl } from '@/api/resources';
import { type FileItem } from '@/api/types';
import { FileInfoSheet } from '@/components/files/file-info-sheet';
import { ThemedText } from '@/components/themed-text';
import { HeaderButton } from '@/components/ui/header-button';
import { Icon } from '@/components/ui/icon';
import { ToastHost } from '@/components/ui/toast-host';
import { Spacing } from '@/constants/theme';
import { fileKind } from '@/lib/files';
import { getViewerItems } from '@/lib/viewer-store';
import { useSelf, useServer } from '@/session/session';
import { downloadItems } from '@/transfers/download';

const BLACK = '#000000';
const WHITE = '#ffffff';

export default function ViewerScreen() {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ source: string; path: string }>();
  const { data: self } = useSelf();

  const [items] = useState<FileItem[]>(() => {
    const list = getViewerItems();
    return list.some((i) => i.path === params.path)
      ? list
      : list.filter((i) => i.source === params.source);
  });
  const initial = Math.max(
    0,
    items.findIndex((i) => i.path === params.path),
  );
  const [index, setIndex] = useState(initial);
  const [infoItem, setInfoItem] = useState<FileItem | null>(null);
  const current = items[index];
  const canDownload = !!self?.scopes.find((s) => s.name === current?.source)?.permissions.download;

  useEffect(() => {
    if (!current) router.back();
  }, [current]);

  if (!current) return null;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: current.name,
          headerTransparent: true,
          headerStyle: { backgroundColor: 'rgba(0,0,0,0.45)' },
          headerTintColor: WHITE,
          headerTitleStyle: { color: WHITE },
          headerRight: () => (
            <View style={styles.row}>
              {canDownload ? (
                <HeaderButton
                  icon="download"
                  label={t('general.download')}
                  color={WHITE}
                  onPress={() => void downloadItems([current])}
                />
              ) : null}
              {self?.permissions.share ? (
                <HeaderButton
                  icon="share"
                  label={t('general.share')}
                  color={WHITE}
                  onPress={() =>
                    router.push({
                      pathname: '/share-create',
                      params: { source: current.source, path: current.path, name: current.name },
                    })
                  }
                />
              ) : null}
              <HeaderButton
                icon="info"
                label={t('general.info')}
                color={WHITE}
                onPress={() => setInfoItem(current)}
              />
            </View>
          ),
        }}
      />
      <FlatList
        data={items}
        horizontal
        pagingEnabled
        initialScrollIndex={initial}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(i) => `${i.source}:${i.path}`}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)))
        }
        windowSize={3}
        renderItem={({ item, index: i }) => (
          <View style={{ width, height }}>
            <MediaPage item={item} active={i === index} />
          </View>
        )}
      />
      {items.length > 1 ? (
        <ThemedText type="caption" style={styles.counter}>
          {index + 1} / {items.length}
        </ThemedText>
      ) : null}
      <FileInfoSheet item={infoItem} onClose={() => setInfoItem(null)} />
      <ToastHost />
    </View>
  );
}

function MediaPage({ item, active }: { item: FileItem; active: boolean }) {
  const kind = fileKind(item);
  if (kind === 'image') return <ImagePage item={item} />;
  // Players only exist for the visible page so swiping never plays two things at once.
  if (!active) return <Placeholder item={item} />;
  if (kind === 'video') return <VideoPage item={item} />;
  return <AudioPage item={item} />;
}

function ImagePage({ item }: { item: FileItem }) {
  const { enableThumbs } = useServer();
  const headers = authHeaders();

  return (
    <Image
      source={{
        uri: rawUrl(item, true),
        headers,
        cacheKey: `${getBaseUrl()}|raw:${item.source}:${item.path}:${item.modified}`,
      }}
      placeholder={
        enableThumbs && item.hasPreview
          ? {
              uri: previewUrl(item, 'large'),
              headers,
              cacheKey: `${getBaseUrl()}|${item.source}:${item.path}:${item.modified}:l`,
            }
          : undefined
      }
      placeholderContentFit="contain"
      contentFit="contain"
      style={styles.fill}
      accessibilityLabel={item.name}
      accessibilityIgnoresInvertColors
    />
  );
}

/**
 * Player source for audio/video. v2.0.1 meant inline media to go through `api/media/stream`,
 * but that endpoint answers 416 unless the first request carries a Range header, which the
 * Android player (Media3) never sends. So play from `api/raw` as a regular download: it serves
 * Range requests normally, but needs download permission and shows up as downloads in the
 * server's activity log.
 */
function useStreamSource(item: FileItem) {
  const { t } = useTranslation();
  const { data: self } = useSelf();
  const canDownload = !!self?.scopes.find((s) => s.name === item.source)?.permissions.download;
  const source = useMemo(
    () => (canDownload ? { uri: rawUrl(item), headers: authHeaders() } : null),
    [item, canDownload],
  );
  return { source, error: self && !canDownload ? t('files.noDownloadAccess') : null };
}

function VideoPage({ item }: { item: FileItem }) {
  const { source, error } = useStreamSource(item);
  const player = useVideoPlayer(source, (p) => {
    p.play();
  });

  if (error) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.white}>{error}</ThemedText>
      </View>
    );
  }
  return (
    <VideoView
      player={player}
      style={styles.fill}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture={false}
    />
  );
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function AudioPage({ item }: { item: FileItem }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { source, error } = useStreamSource(item);
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const { enableThumbs } = useServer();

  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
        void player.seekTo(0);
      }
      player.play();
    }
  };

  return (
    <View style={[styles.center, { paddingBottom: insets.bottom }]}>
      {enableThumbs && item.hasPreview ? (
        <Image
          source={{ uri: previewUrl(item, 'large'), headers: authHeaders() }}
          style={styles.cover}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon name="music_note" size={120} color={WHITE} />
      )}
      <ThemedText style={styles.white} numberOfLines={2}>
        {item.name}
      </ThemedText>
      <ThemedText type="caption" style={styles.white}>
        {error ? error : `${formatTime(status.currentTime)} / ${formatTime(status.duration)}`}
      </ThemedText>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={t('general.playPause')}
        style={styles.play}>
        <Icon name={status.playing ? 'pause' : 'play_arrow'} size={48} color={BLACK} />
      </Pressable>
    </View>
  );
}

function Placeholder({ item }: { item: FileItem }) {
  return (
    <View style={styles.center}>
      <Icon name={fileKind(item) === 'video' ? 'movie' : 'music_note'} size={96} color={WHITE} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BLACK },
  row: { flexDirection: 'row' },
  fill: { flex: 1, backgroundColor: BLACK },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  cover: { width: 240, height: 240, borderRadius: 12 },
  white: { color: WHITE, textAlign: 'center' },
  play: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    bottom: Spacing.five,
    alignSelf: 'center',
    color: WHITE,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 8,
  },
});
