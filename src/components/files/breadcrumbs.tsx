import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BreadcrumbsProps = {
  source: string;
  path: string;
  onNavigate: (path: string) => void;
};

export function Breadcrumbs({ source, path, onNavigate }: BreadcrumbsProps) {
  const theme = useTheme();
  const scroll = useRef<ScrollView>(null);
  const parts = path.split('/').filter(Boolean);
  const crumbs = [
    { label: source, path: '/' },
    ...parts.map((part, i) => ({ label: part, path: `/${parts.slice(0, i + 1).join('/')}/` })),
  ];

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: false });
  }, [path]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.bar}
      style={{ backgroundColor: theme.background, flexGrow: 0 }}>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Pressable
            key={crumb.path}
            disabled={last}
            onPress={() => onNavigate(crumb.path)}
            hitSlop={6}
            style={styles.crumb}
            accessibilityRole="link">
            {i > 0 ? <Icon name="chevron_right" size={18} color={theme.textSecondary} /> : null}
            <ThemedText
              type={last ? 'smallBold' : 'small'}
              themeColor={last ? 'text' : 'primary'}
              numberOfLines={1}>
              {crumb.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
