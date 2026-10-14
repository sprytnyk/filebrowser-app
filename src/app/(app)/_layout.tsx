import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/use-theme';
import { updateProfile } from '@/session/servers';
import { useSelf, useSession } from '@/session/session';
import { isRunning, useTransfers } from '@/transfers/store';

export default function AppTabs() {
  const { t } = useTranslation();
  const theme = useTheme();
  const running = useTransfers().filter(isRunning).length;
  const { activeId, profiles } = useSession();
  const { data: self } = useSelf();

  // Profiles carried over from the single-server version don't know their account name yet.
  const savedName = profiles.find((p) => p.id === activeId)?.username;
  useEffect(() => {
    if (activeId && self && savedName === null) {
      updateProfile(activeId, { username: self.username });
    }
  }, [activeId, self, savedName]);

  return (
    <NativeTabs
      backgroundColor={theme.surfacePrimary}
      indicatorColor={theme.selected}
      labelStyle={{ selected: { color: theme.primary } }}>
      <NativeTabs.Trigger name="files">
        <NativeTabs.Trigger.Label>{t('general.files')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="folder" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="transfers">
        <NativeTabs.Trigger.Label>{t('mobile.transfers')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="swap_vert" />
        {/* `hidden` is ignored once the badge has a value, so leave it out entirely at zero. */}
        {running > 0 ? (
          <NativeTabs.Trigger.Badge>{String(running)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shares">
        <NativeTabs.Trigger.Label>{t('mobile.shares')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="share" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t('general.settings')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
