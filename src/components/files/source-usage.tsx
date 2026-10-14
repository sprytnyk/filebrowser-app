import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { getListing } from '@/api/resources';
import { type SourceInfo } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatSize } from '@/lib/files';

/**
 * Space taken by the source's files against the free space left on its disk, e.g.
 * "80 KB used · 17 GB free". The disk's own used figure isn't shown: it counts the OS and
 * everything else on that filesystem, not just what's in the source.
 *
 * "Used" is the size of the source's root folder: the server's own usage figure is cached
 * and lags behind uploads and deletes, while the root listing is current.
 */
export function SourceUsage({ source }: { source: SourceInfo }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const root = useQuery({
    queryKey: ['listing', source.name, '/'],
    queryFn: () => getListing(source.name, '/'),
  });
  const { refetch } = root;
  useFocusEffect(
    useCallback(() => {
      void refetch({ cancelRefetch: false });
    }, [refetch]),
  );
  const used = Math.max(0, root.data?.size ?? source.used);
  // The server reports disk used as total minus available (like df), so this is df's "Avail".
  const free =
    source.total > 0 && (source.usedAlt ?? 0) > 0 ? source.total - source.usedAlt! : null;
  if (free === null) {
    return (
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
        {t('mobile.storageUsed', { used: formatSize(used) })}
      </ThemedText>
    );
  }
  const capacity = used + free;
  const percent = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
  return (
    <View style={styles.usage}>
      <View
        style={[styles.track, { backgroundColor: theme.surfaceSecondary }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}>
        {/* At least a sliver, so a few KB on a big disk still shows up. */}
        <View
          style={[
            styles.fill,
            { width: `${used > 0 ? Math.max(percent, 1) : 0}%`, backgroundColor: theme.primary },
          ]}
        />
      </View>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
        {t('mobile.storageUsedFree', { used: formatSize(used), free: formatSize(free) })}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  usage: { gap: 4 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
