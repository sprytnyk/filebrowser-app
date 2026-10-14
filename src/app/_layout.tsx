import { useLanguageSync } from '@/i18n';

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ApiError } from '@/api/client';
import { DialogHost } from '@/components/ui/dialog-host';
import { Colors } from '@/constants/theme';
import { useIsDark } from '@/hooks/use-theme';
import { LockGate } from '@/lock/lock-gate';
import { SessionProvider, useSession } from '@/session/session';
import { clearDownloadScratch } from '@/transfers/download';

clearDownloadScratch();

// React Native has no window focus; refetch stale queries when the app comes to the foreground.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
  return () => sub.remove();
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 4xx answers won't change on retry; network blips might.
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
        staleTime: 30 * 1000,
      },
    },
  });
}

function RootStack() {
  const { server, token, adding, switching } = useSession();
  const { t } = useTranslation();
  useLanguageSync();
  const dark = useIsDark();
  const colors = Colors[dark ? 'dark' : 'light'];
  const base = dark ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.surfacePrimary,
          text: colors.text,
          border: colors.divider,
        },
      }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShadowVisible: false }}>
        {/* Always available: the start URL, and where the guards fall back to. */}
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Protected guard={switching}>
          <Stack.Screen name="switching" options={{ headerShown: false, animation: 'none' }} />
        </Stack.Protected>
        <Stack.Protected guard={(!server || adding) && !switching}>
          <Stack.Screen name="setup/server" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!server && !token && !adding && !switching}>
          <Stack.Screen name="setup/login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!server && !!token && !adding && !switching}>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="settings/password" options={{ title: t('mobile.changePassword') }} />
          <Stack.Screen name="move-copy" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="share-create"
            options={{
              presentation: 'formSheet',
              headerShown: false,
              sheetAllowedDetents: [0.75, 1],
              sheetCornerRadius: 16,
            }}
          />
          <Stack.Screen
            name="viewer"
            options={{ presentation: 'fullScreenModal', animation: 'fade', title: '' }}
          />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <LockGate>
            <RootStack />
            <DialogHost />
          </LockGate>
        </SessionProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
