import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  /** Adds a show/hide toggle and hides the value by default. */
  secret?: boolean;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, secret = false, style, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? theme.danger : focused ? theme.primary : theme.surfaceSecondary;

  return (
    <View style={styles.wrapper}>
      <ThemedText type="smallBold" themeColor="textPrimary">
        {label}
      </ThemedText>
      <View style={[styles.field, { borderColor, backgroundColor: theme.surfacePrimary }]}>
        <TextInput
          ref={ref}
          placeholderTextColor={theme.textSecondary}
          secureTextEntry={secret && !revealed}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, { color: theme.text }, style]}
          {...rest}
        />
        {secret && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide' : 'Show'}
            hitSlop={8}
            onPress={() => setRevealed((v) => !v)}>
            <Icon name={revealed ? 'visibility_off' : 'visibility'} size={20} />
          </Pressable>
        )}
      </View>
      {error ? (
        <ThemedText type="caption" themeColor="danger">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 48,
    fontSize: 16,
  },
});
