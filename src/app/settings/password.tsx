import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { ApiError } from '@/api/client';
import { changePassword } from '@/api/users';
import { ThemedView } from '@/components/themed-view';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ToastHost } from '@/components/ui/toast-host';
import { Spacing } from '@/constants/theme';
import { errorMessage, toast } from '@/lib/notify';
import { useSelf, useServer } from '@/session/session';

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const server = useServer();
  const { data: self } = useSelf();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const min = server.passwordMinLength;

  const problem =
    next.length > 0 && next.length < min
      ? t('settings.passwordRequirementsMinLength', { min })
      : again.length > 0 && next !== again
        ? t('login.passwordsDontMatch')
        : next.length > 0 && next === current
          ? t('login.requirePasswordChangeMustDiffer')
          : null;
  const ready = !!self && current !== '' && next !== '' && again !== '' && !problem;

  async function submit() {
    if (!self || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await changePassword(self.username, current, next);
      toast(t('settings.settingsUpdated'));
      router.back();
    } catch (e) {
      // The backend answers 401 when X-Password (the current password) is wrong.
      setError(
        e instanceof ApiError && e.status === 401 ? t('login.wrongCredentials') : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('mobile.currentPassword')}
          value={current}
          onChangeText={setCurrent}
          secret
          autoComplete="current-password"
          textContentType="password"
        />
        <TextField
          label={t('mobile.newPassword')}
          value={next}
          onChangeText={setNext}
          secret
          autoComplete="new-password"
          textContentType="newPassword"
          hint={t('settings.passwordRequirementsMinLength', { min })}
        />
        <TextField
          label={t('settings.enterPasswordAgain')}
          value={again}
          onChangeText={setAgain}
          secret
          autoComplete="new-password"
          error={problem ?? undefined}
          onSubmitEditing={submit}
        />
        {error ? <Banner kind="error" message={error} /> : null}
        <Button title={t('general.update')} loading={busy} disabled={!ready} onPress={submit} />
      </ScrollView>
      <ToastHost />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three },
});
