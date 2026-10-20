import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler } from 'react-native';

import { GatewayError, NetworkError } from '@/api/client';
import { NotFilebrowserError, probeServer } from '@/api/server';
import { type ServerInfo } from '@/api/types';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { TextField } from '@/components/ui/text-field';
import { openGatewaySignIn } from '@/lib/gateway';
import { hasScheme, isPlainHttp, normalizeServerUrl } from '@/lib/url';
import { normalizeLabel } from '@/session/servers';
import { useSession } from '@/session/session';

export default function ServerScreen() {
  const { t } = useTranslation();
  const { connect, adding, cancelAdding } = useSession();
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Plain-http servers need an explicit second tap after the warning.
  const [pendingHttp, setPendingHttp] = useState<ServerInfo | null>(null);

  // While adding another server, back returns to the current one instead of leaving the app.
  useEffect(() => {
    if (!adding) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelAdding();
      return true;
    });
    return () => sub.remove();
  }, [adding, cancelAdding]);

  /** A sign-in gateway in front of the server gets its login page first, then a second probe. */
  async function probeOrSignIn(baseUrl: string): Promise<ServerInfo> {
    try {
      return await probeServer(baseUrl);
    } catch (e) {
      if (!(e instanceof GatewayError) || !(await openGatewaySignIn(baseUrl))) throw e;
      return { ...(await probeServer(baseUrl)), gateway: true };
    }
  }

  /**
   * Without a scheme, tries HTTPS and falls back to plain HTTP when nothing answers there (or
   * something other than FileBrowser does), so "192.168.1.5:8080" works for either. A timeout
   * doesn't fall back: the host is unreachable, and trying again would only double the wait.
   */
  async function probeTyped(baseUrl: string): Promise<ServerInfo> {
    try {
      return await probeOrSignIn(baseUrl);
    } catch (e) {
      const fallback =
        !hasScheme(input) &&
        ((e instanceof NetworkError && !e.timedOut) || e instanceof NotFilebrowserError);
      if (!fallback) throw e;
      try {
        return await probeOrSignIn(normalizeServerUrl(input, 'http')!);
      } catch {
        // Report what went wrong with HTTPS, the address the user most likely meant.
        throw e;
      }
    }
  }

  async function submit() {
    if (pendingHttp) {
      connect(pendingHttp, normalizeLabel(name, pendingHttp));
      return;
    }
    const baseUrl = normalizeServerUrl(input);
    if (!baseUrl) {
      setError(t('mobile.invalidUrl'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const info = await probeTyped(baseUrl);
      if (isPlainHttp(info.baseUrl)) {
        setInput(info.baseUrl);
        setPendingHttp(info);
      } else {
        connect(info, normalizeLabel(name, info));
      }
    } catch (e) {
      if (e instanceof GatewayError) setError(t('mobile.gatewayBlocked'));
      else if (e instanceof NotFilebrowserError) setError(t('mobile.notFilebrowser'));
      else if (e instanceof NetworkError)
        setError(e.timedOut ? t('errors.requestTimedOut') : t('errors.connection'));
      else setError(t('prompts.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen
      title={adding ? t('mobile.addServer') : t('mobile.serverTitle')}
      subtitle={t('mobile.serverDescription')}>
      <TextField
        label={t('mobile.serverUrl')}
        placeholder={t('mobile.serverUrlPlaceholder')}
        value={input}
        onChangeText={(v) => {
          setInput(v);
          setError(null);
          setPendingHttp(null);
        }}
        keyboardType="url"
        textContentType="URL"
        autoComplete="url"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={error ?? undefined}
        editable={!busy}
      />
      <TextField
        label={t('mobile.serverName')}
        hint={t('mobile.serverNameHint')}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!busy}
      />
      {pendingHttp ? <Banner kind="warning" message={t('mobile.httpWarning')} /> : null}
      <Button
        title={pendingHttp ? t('mobile.continueAnyway') : t('mobile.connect')}
        variant={pendingHttp ? 'secondary' : 'primary'}
        loading={busy}
        disabled={input.trim() === ''}
        onPress={submit}
      />
      {adding ? <Button title={t('general.cancel')} variant="flat" onPress={cancelAdding} /> : null}
    </FormScreen>
  );
}
