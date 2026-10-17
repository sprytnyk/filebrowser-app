import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ChipButton } from '@/components/ui/chip-button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type HashCardProps = {
  label: string;
  value: string | null;
  calculating: boolean;
  error: string | null;
  onCalculate: () => void;
};

/**
 * A checksum in a card: a button to calculate it, then the value in monospace, in groups of 8
 * with every other group dimmed, so it can be compared by eye. Everything happens in place
 * because the sheet it sits in stays open.
 */
export function HashCard({ label, value, calculating, error, onCalculate }: HashCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(true);
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surfacePrimary }]}>
      <View style={styles.header}>
        <Icon name="tag" size={16} color={theme.textSecondary} />
        <ThemedText type="caption" themeColor="textSecondary" style={styles.flex}>
          {label}
        </ThemedText>
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? t('buttons.copySuccess') : t('mobile.copySha256')}
            onPress={() => void copy()}
            hitSlop={8}
            style={({ pressed }) => [
              styles.copy,
              pressed && { backgroundColor: theme.surfaceSecondary },
            ]}>
            <Icon
              name={copied ? 'check' : 'content_copy'}
              size={18}
              color={copied ? theme.primary : theme.textPrimary}
            />
          </Pressable>
        ) : null}
      </View>
      {calculating ? (
        <View style={styles.status}>
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('mobile.calculating')}
          </ThemedText>
        </View>
      ) : value ? (
        <Pressable
          onLongPress={() => void copy()}
          accessibilityLabel={`${label} ${value}`}
          style={styles.groups}>
          {value.match(/.{1,8}/g)!.map((group, i) => (
            <ThemedText
              key={i}
              type="small"
              themeColor={i % 2 ? 'textSecondary' : 'text'}
              style={styles.mono}>
              {group}
            </ThemedText>
          ))}
        </Pressable>
      ) : (
        <View style={styles.idle}>
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          <ChipButton
            icon={error ? 'refresh' : 'calculate'}
            label={error ? t('general.retry') : t('mobile.calculateSha256')}
            onPress={onCalculate}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    marginHorizontal: Spacing.three,
    marginVertical: Spacing.two,
    padding: Spacing.three,
    paddingTop: Spacing.two,
    borderRadius: Radius.medium,
    gap: Spacing.two,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 32 },
  copy: { padding: 6, borderRadius: Radius.pill },
  // As tall as the Calculate button, so the card keeps its height when calculation starts.
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 36 },
  idle: { alignItems: 'flex-start', gap: Spacing.two },
  groups: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.two, rowGap: Spacing.one },
  mono: { fontFamily: 'monospace', letterSpacing: 0.5 },
});
