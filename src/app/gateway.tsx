import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { request } from '@/api/client';
import { Banner } from '@/components/ui/banner';
import { HeaderButton } from '@/components/ui/header-button';
import { HeaderTitle } from '@/components/ui/header-title';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { finishGatewaySignIn } from '@/lib/gateway';

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').split(/[/?#]/)[0];
}

/**
 * The sign-in page of a gateway in front of the server (Authelia and the like), in a WebView so
 * its session cookie lands in the store fetch shares. Sign-in mode closes by itself once
 * requests reach the backend again; sign-out mode shows the gateway's logout page until Done.
 */
export default function GatewayScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { url, mode } = useLocalSearchParams<{ url: string; mode?: 'signout' }>();
  const signOut = mode === 'signout';
  const [host, setHost] = useState(() => hostOf(url));
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const done = useRef(false);
  const busy = useRef(false);

  // Leaving without getting through (back, swipe) cancels the sign-in.
  useEffect(
    () => () => {
      if (!signOut && !done.current) finishGatewaySignIn(false);
    },
    [signOut],
  );

  async function check(current: string) {
    // Still on the gateway's pages, or already checking.
    if (signOut || done.current || busy.current || !current.startsWith(url)) return;
    busy.current = true;
    setChecking(true);
    try {
      await request('health', { baseUrl: url, auth: false, timeoutMs: 10_000 });
      done.current = true;
      finishGatewaySignIn(true);
      router.back();
    } catch {
      // Not through yet (a same-host sign-in page); keep showing it.
      setChecking(false);
    } finally {
      busy.current = false;
    }
  }

  function onNavigation(state: WebViewNavigation) {
    setHost(hostOf(state.url));
    if (!state.loading) void check(state.url);
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title={t('mobile.gatewayTitle')} subtitle={host} />,
          headerRight: signOut
            ? () => (
                <HeaderButton
                  icon="check"
                  label={t('mobile.gatewayDone')}
                  onPress={() => router.back()}
                />
              )
            : undefined,
        }}
      />
      <View style={styles.hint}>
        <Banner
          kind={failed ? 'error' : 'info'}
          message={
            failed
              ? t('mobile.gatewayLoadFailed')
              : signOut
                ? t('mobile.gatewaySignOutHint')
                : t('mobile.gatewayHint')
          }
        />
      </View>
      <WebView
        source={{ uri: url }}
        style={styles.web}
        onNavigationStateChange={onNavigation}
        onError={() => setFailed(true)}
        onLoadStart={() => setFailed(false)}
        startInLoadingState
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
      />
      {checking ? (
        <View
          style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hint: { padding: Spacing.three },
  web: { flex: 1 },
  cover: { alignItems: 'center', justifyContent: 'center' },
});
