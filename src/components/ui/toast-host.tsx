import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dismissToast, newToastHostId, registerToastHost, useToast } from '@/lib/toast';

/** Floating action button height plus its gap, for screens that show one. */
const FAB_CLEARANCE = 56 + Spacing.two;

type ToastHostProps = {
  /** Lifts the snackbar above the screen's floating action button. */
  aboveFab?: boolean;
};

/**
 * Draws `toast()` messages as a themed snackbar at the bottom of this screen. Mount it as the
 * last child of each screen's root view; only the focused screen's host draws.
 */
export function ToastHost({ aboveFab }: ToastHostProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [hostId] = useState(newToastHostId);
  const { toast, activeHost } = useToast();

  useEffect(() => {
    if (focused) return registerToastHost(hostId);
  }, [focused, hostId]);

  if (!toast || activeHost !== hostId) return null;

  return (
    <Animated.View
      key={toast.key}
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(150)}
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom: Spacing.three + insets.bottom + (aboveFab ? FAB_CLEARANCE : 0) },
      ]}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onPress={() => dismissToast(toast.key)}
        style={[styles.bar, { backgroundColor: theme.snackbar }]}>
        <ThemedText type="small" style={[styles.message, { color: theme.onSnackbar }]}>
          {toast.message}
        </ThemedText>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              dismissToast(toast.key);
              toast.action?.onPress();
            }}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {toast.action.label.toUpperCase()}
            </ThemedText>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.three, right: Spacing.three },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
    elevation: 6,
    gap: Spacing.two,
  },
  message: { flex: 1, paddingVertical: Spacing.one },
  action: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
});
