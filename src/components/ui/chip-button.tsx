import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChipButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Spoken instead of the short visible label, e.g. "Copy download link". */
  accessibilityLabel?: string;
};

/** Small labelled pill button for inline actions on cards. */
export function ChipButton({ icon, label, onPress, accessibilityLabel }: ChipButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: pressed ? theme.altBackground : theme.surfaceSecondary },
      ]}>
      <Icon name={icon} size={18} color={theme.primary} />
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 36,
    paddingHorizontal: Spacing.three - Spacing.one,
    borderRadius: Radius.pill,
  },
});
