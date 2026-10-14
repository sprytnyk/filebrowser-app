import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextPromptProps = {
  visible: boolean;
  title: string;
  label: string;
  initialValue?: string;
  submitLabel: string;
  /** Returns an error message to show, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => Promise<void> | void;
  onCancel: () => void;
  cancelLabel: string;
};

/** Android has no Alert.prompt, so text input dialogs use this modal. */
export function TextPrompt(props: TextPromptProps) {
  if (!props.visible) return null;
  // Remount per opening so the field starts from initialValue every time.
  return <TextPromptDialog {...props} />;
}

function TextPromptDialog({
  title,
  label,
  initialValue = '',
  submitLabel,
  cancelLabel,
  validate,
  onSubmit,
  onCancel,
}: TextPromptProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const error = value === initialValue ? null : (validate?.(value) ?? null);
  // Select the base name (not the extension) when renaming a file.
  const dot = initialValue.lastIndexOf('.');
  const selectionEnd = dot > 0 ? dot : initialValue.length;

  async function submit() {
    if (error || value.trim() === '' || busy) return;
    setBusy(true);
    try {
      await onSubmit(value.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onCancel}>
          <Pressable style={[styles.card, { backgroundColor: theme.background }]}>
            <ThemedText type="subtitle">{title}</ThemedText>
            <TextField
              label={label}
              value={value}
              onChangeText={setValue}
              autoFocus
              selection={value === initialValue ? { start: 0, end: selectionEnd } : undefined}
              returnKeyType="done"
              onSubmitEditing={submit}
              error={error ?? undefined}
            />
            <View style={styles.actions}>
              <Button title={cancelLabel} variant="flat" onPress={onCancel} />
              <Button
                title={submitLabel}
                loading={busy}
                disabled={!!error || value.trim() === ''}
                onPress={submit}
              />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
