import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { authHeaders, getBaseUrl } from '@/api/client';
import { previewUrl } from '@/api/resources';
import { type FileItem } from '@/api/types';
import { Icon } from '@/components/ui/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type FileKind, fileKind, kindIcon } from '@/lib/files';
import { useServer } from '@/session/session';

/** Kinds the server draws previews for; it renders the first page of a PDF. */
const THUMB_KINDS: FileKind[] = ['image', 'video', 'pdf'];

type FileThumbProps = {
  item: FileItem;
  size: number;
};

/** Server thumbnail for images, videos and PDFs if previews are on, otherwise a type icon. */
export function FileThumb({ item, size }: FileThumbProps) {
  const theme = useTheme();
  const { enableThumbs } = useServer();
  const [failed, setFailed] = useState(false);
  const kind = fileKind(item);
  const icon = kindIcon(kind);
  const showThumb = enableThumbs && item.hasPreview && !failed && THUMB_KINDS.includes(kind);

  return (
    <View
      style={[styles.box, { width: size, height: size, backgroundColor: theme.iconBackground }]}>
      {showThumb ? (
        <Image
          source={{
            uri: previewUrl(item, size > 96 ? 'large' : 'small'),
            headers: authHeaders(),
            // Thumbnails change when the file does; tie the cache to its modification time.
            cacheKey: `${getBaseUrl()}|${item.source}:${item.path}:${item.modified}:${size > 96 ? 'l' : 's'}`,
          }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={`${item.source}:${item.path}`}
          transition={120}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon name={icon.name} color={icon.color} size={Math.round(size * 0.55)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
