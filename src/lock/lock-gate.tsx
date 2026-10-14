import { Image } from 'expo-image';
import { type PropsWithChildren, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  authenticate,
  noteBackground,
  noteForeground,
  setLocked,
  useLocked,
} from '@/lock/lock-state';

/** Covers the app with an unlock screen while the optional screen lock is engaged. */
export function LockGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locked = useLocked();
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (await authenticate(t('mobile.unlockPrompt'), t('general.cancel'))) setLocked(false);
    } finally {
      prompting.current = false;
    }
  }, [t]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // The biometric prompt itself makes the app "inactive"; only real backgrounding counts.
      if (state === 'background') noteBackground();
      else if (state === 'active') noteForeground();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (locked && AppState.currentState === 'active') void unlock();
  }, [locked, unlock]);

  return (
    <View style={styles.flex}>
      {children}
      {locked ? (
        <View
          style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }]}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logo}
            accessibilityIgnoresInvertColors
          />
          <ThemedText type="subtitle">{t('mobile.locked')}</ThemedText>
          <Button title={t('mobile.unlock')} icon="fingerprint" onPress={() => void unlock()} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  logo: { width: 96, height: 96 },
});
