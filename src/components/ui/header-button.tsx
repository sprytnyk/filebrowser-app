import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

type HeaderButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
};

export function HeaderButton({ icon, label, onPress, color }: HeaderButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        pressed && { backgroundColor: theme.surfacePrimary },
      ]}>
      <Icon name={icon} color={color ?? theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
    borderRadius: 999,
  },
});
