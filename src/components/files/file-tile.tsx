import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { type FileItem } from '@/api/types';
import { FileThumb } from '@/components/files/file-thumb';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FileTileProps = {
  item: FileItem;
  size: number;
  selected: boolean;
  selecting: boolean;
  onPress: () => void;
  onLongPress: () => void;
  /** Shown as a button on selected tiles, opposite the check mark. */
  onInfo?: () => void;
};

export function FileTile({
  item,
  size,
  selected,
  selecting,
  onPress,
  onLongPress,
  onInfo,
}: FileTileProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={item.name}
      style={({ pressed }) => [
        styles.tile,
        {
          width: size,
          backgroundColor: selected
            ? theme.selected
            : pressed
              ? theme.surfacePrimary
              : 'transparent',
        },
      ]}>
      <View>
        <FileThumb item={item} size={size - Spacing.two * 2} />
        {selecting ? (
          <View style={[styles.corner, styles.check, { backgroundColor: theme.background }]}>
            <Icon
              name={selected ? 'check_circle' : 'radio_button_unchecked'}
              color={selected ? theme.primary : theme.textSecondary}
              size={22}
            />
          </View>
        ) : null}
        {selected && onInfo ? (
          <Pressable
            onPress={onInfo}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            accessibilityLabel={t('general.info')}
            style={[styles.corner, styles.info, { backgroundColor: theme.background }]}>
            <Icon name="info" color={theme.primary} size={22} />
          </Pressable>
        ) : null}
      </View>
      <ThemedText type="caption" numberOfLines={2} style={styles.name}>
        {item.name}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    padding: Spacing.two,
    borderRadius: Radius.medium,
    gap: Spacing.one,
  },
  corner: {
    position: 'absolute',
    top: Spacing.one,
    borderRadius: 999,
  },
  check: { left: Spacing.one },
  info: { right: Spacing.one },
  name: {
    textAlign: 'center',
  },
});
