import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type FileItem } from '@/api/types';
import { FileThumb } from '@/components/files/file-thumb';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatSize } from '@/lib/files';

type FileRowProps = {
  item: FileItem;
  selected: boolean;
  selecting: boolean;
  onPress: () => void;
  onLongPress: () => void;
  /** Trailing actions, e.g. the item menu. */
  accessory?: ReactNode;
  /** Shown instead of the date, e.g. the folder for search results. */
  subtitle?: string;
};

export function FileRow({
  item,
  selected,
  selecting,
  onPress,
  onLongPress,
  accessory,
  subtitle,
}: FileRowProps) {
  const theme = useTheme();
  const details = [item.isDir ? null : formatSize(item.size), subtitle ?? formatDate(item.modified)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={item.name}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected
            ? theme.selected
            : pressed
              ? theme.surfacePrimary
              : 'transparent',
        },
      ]}>
      {selecting ? (
        <Icon
          name={selected ? 'check_circle' : 'radio_button_unchecked'}
          color={selected ? theme.primary : theme.textSecondary}
        />
      ) : null}
      <FileThumb item={item} size={44} />
      <View style={styles.text}>
        <ThemedText numberOfLines={1}>{item.name}</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {details}
        </ThemedText>
      </View>
      {!selecting ? accessory : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 60,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
