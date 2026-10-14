import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type HeaderTitleProps = {
  title: string;
  subtitle?: string;
};

/** Two-line header title (native stack headers only take a single line of text). */
export function HeaderTitle({ title, subtitle }: HeaderTitleProps) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <ThemedText numberOfLines={1} style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 1 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: 500 },
});
