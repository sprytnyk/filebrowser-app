import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BannerProps = {
  kind: 'warning' | 'error' | 'info';
  message: string;
};

export function Banner({ kind, message }: BannerProps) {
  const theme = useTheme();
  const look = {
    warning: { bg: theme.warningBackground, fg: theme.warning, icon: 'warning' as const },
    error: { bg: theme.errorBackground, fg: theme.danger, icon: 'error' as const },
    info: { bg: theme.surfacePrimary, fg: theme.primary, icon: 'info' as const },
  }[kind];

  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={[styles.banner, { backgroundColor: look.bg }]}>
      <Icon name={look.icon} size={20} color={look.fg} />
      <ThemedText type="small" style={styles.text}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'flex-start',
  },
  text: {
    flex: 1,
  },
});
