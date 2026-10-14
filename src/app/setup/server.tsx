import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler } from 'react-native';

import { NetworkError } from '@/api/client';
import { NotFilebrowserError, probeServer } from '@/api/server';
import { type ServerInfo } from '@/api/types';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { TextField } from '@/components/ui/text-field';
import { isPlainHttp, normalizeServerUrl } from '@/lib/url';
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
      const info = await probeServer(baseUrl);
      if (isPlainHttp(info.baseUrl)) {
        setInput(info.baseUrl);
        setPendingHttp(info);
      } else {
        connect(info, normalizeLabel(name, info));
      }
    } catch (e) {
      if (e instanceof NotFilebrowserError) setError(t('mobile.notFilebrowser'));
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
