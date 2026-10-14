import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { settle, useCurrentDialog } from '@/lib/dialog';

/** Renders queued `ask()` dialogs with the app theme. Mount once near the root. */
export function DialogHost() {
  const theme = useTheme();
  const dialog = useCurrentDialog();
  if (!dialog) return null;

  const dismiss = () => settle(dialog.key, null);

  return (
    <Modal
      key={dialog.key}
      transparent
      visible
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
      navigationBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={dismiss}>
        <Pressable
          accessibilityRole="alert"
          style={[styles.card, { backgroundColor: theme.surfacePrimary }]}>
          <ThemedText type="subtitle">{dialog.title}</ThemedText>
          {dialog.message ? (
            <ScrollView style={styles.message}>
              <ThemedText themeColor="textSecondary" selectable>
                {dialog.message}
              </ThemedText>
            </ScrollView>
          ) : null}
          <View style={styles.buttons}>
            {dialog.buttons.map((b) => {
              const color =
                b.kind === 'destructive'
                  ? theme.danger
                  : b.kind === 'cancel'
                    ? theme.textSecondary
                    : theme.primary;
              return (
                <Pressable
                  key={b.id}
                  accessibilityRole="button"
                  onPress={() => settle(dialog.key, b.id)}
                  style={({ pressed }) => [
                    styles.button,
                    pressed && { backgroundColor: theme.surfaceSecondary },
                  ]}>
                  <ThemedText type="smallBold" style={{ color }}>
                    {b.label.toUpperCase()}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    borderRadius: Radius.medium * 1.5,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '80%',
  },
  message: {
    flexGrow: 0,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
  },
});
