import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type TextInput } from 'react-native';

import * as authApi from '@/api/auth';
import { NetworkError } from '@/api/client';
import { useServerSwitcher } from '@/components/servers/server-switcher';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { TextField } from '@/components/ui/text-field';
import { profileName } from '@/session/servers';
import { useServer, useSession } from '@/session/session';

type Step = 'credentials' | 'otp' | 'changePassword';

export default function LoginScreen() {
  const { t } = useTranslation();
  const server = useServer();
  const { signIn, notice, profiles, activeId } = useSession();
  const active = profiles.find((p) => p.id === activeId);
  const switcher = useServerSwitcher({ withRemove: true });

  const [step, setStep] = useState<Step>('credentials');
  // Prefilled after a session expires, so only the password needs retyping.
  const [username, setUsername] = useState(active?.username ?? '');
  const [password, setPassword] = useState('');
  const [profileId, setProfileId] = useState(active?.id);
  if (active?.id !== profileId) {
    // Switched servers while on this screen: show that server's account instead.
    setProfileId(active?.id);
    setUsername(active?.username ?? '');
    setPassword('');
  }
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordAgain, setNewPasswordAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const passwordLoginAvailable = server.passwordAvailable || server.ldapAvailable;
  const minLength = server.passwordMinLength;

  async function attemptLogin(code?: string) {
    const token = await authApi.login({
      baseUrl: server.baseUrl,
      username: username.trim(),
      password,
      otp: code,
    });
    signIn(token, username.trim());
  }

  function explain(e: unknown) {
    if (e instanceof NetworkError) {
      setError(e.timedOut ? t('errors.requestTimedOut') : t('errors.connection'));
      return;
    }
    switch (authApi.classifyLoginError(e)) {
      case 'otpRequired':
        if (step === 'otp') setError(t('otp.verificationFailed'));
        setStep('otp');
        return;
      case 'passwordChangeRequired':
        setStep('changePassword');
        return;
      case 'otpNotConfigured':
        setError(t('mobile.otpNotConfigured'));
        return;
      case 'passkeyRequired':
        setError(t('mobile.passkeyRequired'));
        return;
      case 'invalidCredentials':
        setError(step === 'otp' ? t('otp.verificationFailed') : t('login.wrongCredentials'));
        return;
      default:
        setError(t('login.failedLogin'));
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      explain(e);
    } finally {
      setBusy(false);
    }
  }

  const submitCredentials = () => run(() => attemptLogin());

  const submitOtp = () => {
    if (!/^\d{6}$/.test(otp)) {
      setError(t('otp.invalidCodeType'));
      return;
    }
    return run(() => attemptLogin(otp));
  };

  const passwordProblem =
    newPassword.length > 0 && newPassword.length < minLength
      ? t('settings.passwordRequirementsMinLength', { min: minLength })
      : newPasswordAgain.length > 0 && newPassword !== newPasswordAgain
        ? t('login.passwordsDontMatch')
        : newPassword.length > 0 && newPassword === password
          ? t('login.requirePasswordChangeMustDiffer')
          : null;

  const submitNewPassword = () =>
    run(async () => {
      const token = await authApi.changeRequiredPassword({
        baseUrl: server.baseUrl,
        username: username.trim(),
        password,
        otp: otp || undefined,
        newPassword,
      });
      signIn(token, username.trim());
    });

  const subtitle = server.baseUrl.replace(/^https?:\/\//, '');

  if (step === 'changePassword') {
    return (
      <FormScreen
        title={t('login.requirePasswordChangeTitle')}
        subtitle={t('login.requirePasswordChangeInstructions')}>
        <TextField
          label={t('mobile.newPassword')}
          value={newPassword}
          onChangeText={setNewPassword}
          secret
          autoComplete="new-password"
          textContentType="newPassword"
          hint={t('settings.passwordRequirementsMinLength', { min: minLength })}
        />
        <TextField
          label={t('settings.enterPasswordAgain')}
          value={newPasswordAgain}
          onChangeText={setNewPasswordAgain}
          secret
          autoComplete="new-password"
          error={passwordProblem ?? undefined}
          onSubmitEditing={submitNewPassword}
        />
        {error ? <Banner kind="error" message={error} /> : null}
        <Button
          title={t('general.update')}
          loading={busy}
          disabled={!!passwordProblem || newPassword.length === 0 || newPasswordAgain.length === 0}
          onPress={submitNewPassword}
        />
        <Button title={t('general.cancel')} variant="flat" onPress={() => setStep('credentials')} />
      </FormScreen>
    );
  }

  if (step === 'otp') {
    return (
      <FormScreen title={t('otp.name')} subtitle={t('otp.verifyInstructions')}>
        <TextField
          label={t('otp.codeInputPlaceholder')}
          value={otp}
          onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          autoFocus
          maxLength={6}
          onSubmitEditing={submitOtp}
          error={error ?? undefined}
        />
        <Button
          title={t('general.verify')}
          loading={busy}
          disabled={otp.length !== 6}
          onPress={submitOtp}
        />
        <Button
          title={t('general.cancel')}
          variant="flat"
          onPress={() => {
            setOtp('');
            setError(null);
            setStep('credentials');
          }}
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen
      title={t('mobile.signInTo', { server: active ? profileName(active) : server.name })}
      subtitle={subtitle}>
      {notice ? <Banner kind="info" message={notice} /> : null}
      {!passwordLoginAvailable ? (
        <Banner kind="warning" message={t('mobile.passwordDisabled')} />
      ) : null}
      <TextField
        label={t('general.username')}
        value={username}
        onChangeText={setUsername}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!busy}
      />
      <TextField
        ref={passwordRef}
        label={t('general.password')}
        value={password}
        onChangeText={setPassword}
        secret
        autoFocus={!!active?.username}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submitCredentials}
        editable={!busy}
      />
      {error ? <Banner kind="error" message={error} /> : null}
      <Button
        title={t('general.login')}
        loading={busy}
        disabled={username.trim() === '' || password === '' || !passwordLoginAvailable}
        onPress={submitCredentials}
      />
      <Button
        title={profiles.length > 1 ? t('mobile.switchServer') : t('mobile.changeServer')}
        variant="flat"
        onPress={switcher.open}
      />
      {switcher.sheet}
    </FormScreen>
  );
}
