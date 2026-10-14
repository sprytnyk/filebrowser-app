import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import * as authApi from '@/api/auth';
import { useProfileSubtitle, useRemoveServer } from '@/components/servers/server-switcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActionSheet } from '@/components/ui/action-sheet';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { HeaderButton } from '@/components/ui/header-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { TextPrompt } from '@/components/ui/text-prompt';
import { ToastHost } from '@/components/ui/toast-host';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isPlainHttp } from '@/lib/url';
import { authenticate, canUseScreenLock } from '@/lock/lock-state';
import { setPrefs, usePrefs } from '@/session/prefs';
import {
  credentialsFor,
  hostLabel,
  normalizeLabel,
  profileName,
  type ServerProfile,
  setToken,
  updateProfile,
  useServers,
} from '@/session/servers';
import { useSelf, useServer, useSession } from '@/session/session';
import { downloadDirLabel, ensureDownloadDir } from '@/transfers/download';

const GRACE_OPTIONS = [0, 60, 300, 900, 3600] as const;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const server = useServer();
  const { signOut, profiles, activeId, switchTo, startAdding } = useSession();
  const { tokens } = useServers();
  const profileSubtitle = useProfileSubtitle();
  const removeServerAsk = useRemoveServer();
  const { data: self } = useSelf();
  const prefs = usePrefs();
  const [lockAvailable, setLockAvailable] = useState<boolean | null>(null);
  const menu = useActionSheet();
  const [renaming, setRenaming] = useState<ServerProfile | null>(null);

  useEffect(() => {
    void canUseScreenLock().then(setLockAvailable);
  }, []);

  const graceLabel = (seconds: number) =>
    seconds === 0
      ? t('mobile.lockImmediately')
      : seconds >= 3600
        ? t('mobile.lockAfterHours', { count: seconds / 3600 })
        : t('mobile.lockAfterMinutes', { count: seconds / 60 });

  async function toggleLock(next: boolean) {
    // Confirm the user can actually unlock before turning the lock on.
    if (next && !(await authenticate(t('mobile.unlockPrompt'), t('general.cancel')))) return;
    setPrefs({ lockEnabled: next });
  }

  async function signOutOf(profile: ServerProfile) {
    if (profile.id === activeId) return signOut();
    if (tokens[profile.id]) await authApi.logout(credentialsFor(profile.id));
    setToken(profile.id, null);
  }

  function openServerMenu(profile: ServerProfile) {
    const isActive = profile.id === activeId;
    menu.open({
      title: profileName(profile),
      subtitle: hostLabel(profile.server),
      actions: [
        { id: 'rename', title: t('general.rename'), icon: 'drive_file_rename_outline' },
        ...(isActive
          ? []
          : [{ id: 'switch', title: t('mobile.switchServer'), icon: 'swap_horiz' as const }]),
        ...(tokens[profile.id]
          ? [{ id: 'logout', title: t('general.logout'), icon: 'logout' as const }]
          : []),
        { id: 'remove', title: t('mobile.removeServer'), icon: 'delete', destructive: true },
      ],
      onSelect: (id) => {
        if (id === 'rename') setRenaming(profile);
        else if (id === 'switch') switchTo(profile.id);
        else if (id === 'logout') void signOutOf(profile);
        else if (id === 'remove') void removeServerAsk(profile);
      },
    });
  }

  const canChangePassword = self?.loginMethod === 'password' && !self.lockPassword;

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: t('general.settings') }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Section title={t('mobile.servers')}>
          {profiles.map((p) => {
            const isActive = p.id === activeId;
            return (
              <Row
                key={p.id}
                icon="dns"
                title={profileName(p)}
                subtitle={
                  isActive && server.version
                    ? `${profileSubtitle(p)}\n${t('mobile.version')} ${server.version}`
                    : profileSubtitle(p)
                }
                onPress={isActive ? undefined : () => switchTo(p.id)}
                trailing={
                  <>
                    {isActive ? <Icon name="check_circle" color={theme.primary} /> : null}
                    <HeaderButton
                      icon="more_vert"
                      label={t('general.actions')}
                      onPress={() => openServerMenu(p)}
                    />
                  </>
                }
              />
            );
          })}
          <Row icon="add" title={t('mobile.addServer')} onPress={startAdding} />
          {isPlainHttp(server.baseUrl) ? (
            <Banner kind="warning" message={t('mobile.httpWarning')} />
          ) : null}
        </Section>

        <Section title={t('mobile.account')}>
          <Row
            icon="account_circle"
            title={self?.username ?? '…'}
            subtitle={self ? `${t('settings.loginMethod')}: ${self.loginMethod}` : undefined}
          />
          {canChangePassword ? (
            <Row
              icon="password"
              title={t('general.change', { suffix: ` ${t('general.password')}` })}
              onPress={() => router.push('/settings/password')}
              chevron
            />
          ) : null}
        </Section>

        <Section title={t('general.downloads')}>
          <Row
            icon="folder_open"
            title={t('mobile.downloadFolder')}
            subtitle={downloadDirLabel(prefs.downloadDirUri) ?? t('mobile.downloadFolderUnset')}
            onPress={() => void ensureDownloadDir(true)}
            chevron
          />
        </Section>

        <Section title={t('mobile.security')}>
          <Row
            icon="lock"
            title={t('mobile.screenLock')}
            subtitle={
              lockAvailable === false
                ? t('mobile.screenLockUnavailable')
                : t('mobile.screenLockHint')
            }
            trailing={
              <Switch
                value={prefs.lockEnabled}
                disabled={!lockAvailable}
                onValueChange={(v) => void toggleLock(v)}
                trackColor={{ true: theme.primary }}
                accessibilityLabel={t('mobile.screenLock')}
              />
            }
          />
          {prefs.lockEnabled ? (
            <Row
              icon="timer"
              title={t('mobile.lockAfter')}
              subtitle={graceLabel(prefs.lockGraceSeconds)}
              chevron
              onPress={() =>
                menu.open({
                  title: t('mobile.lockAfter'),
                  actions: GRACE_OPTIONS.map((s) => ({
                    id: String(s),
                    title: graceLabel(s),
                    checked: prefs.lockGraceSeconds === s,
                  })),
                  onSelect: (id) => setPrefs({ lockGraceSeconds: Number(id) }),
                })
              }
            />
          ) : null}
        </Section>

        <View style={styles.actions}>
          <Button
            title={t('general.logout')}
            icon="logout"
            variant="secondary"
            onPress={() => void signOut()}
          />
        </View>

        {menu.sheet}
        <TextPrompt
          visible={renaming !== null}
          title={t('mobile.renameServer')}
          label={t('mobile.serverName')}
          initialValue={renaming ? profileName(renaming) : ''}
          submitLabel={t('general.save')}
          cancelLabel={t('general.cancel')}
          onSubmit={(value) => {
            if (renaming)
              updateProfile(renaming.id, { label: normalizeLabel(value, renaming.server) });
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
        <ThemedText type="caption" themeColor="textSecondary" style={styles.about}>
          {`${Constants.expoConfig?.name ?? ''} ${Constants.expoConfig?.version ?? ''}\n${t('mobile.about')}`}
        </ThemedText>
      </ScrollView>
      <ToastHost />
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="primary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <View style={[styles.card, { backgroundColor: theme.surfacePrimary }]}>{children}</View>
    </View>
  );
}

type RowProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  chevron?: boolean;
  trailing?: ReactNode;
};

function Row({ icon, title, subtitle, onPress, chevron, trailing }: RowProps) {
  const theme = useTheme();
  const content = (
    <>
      <Icon name={icon} color={theme.textPrimary} />
      <View style={styles.flex}>
        <ThemedText numberOfLines={1}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {trailing}
      {chevron ? <Icon name="chevron_right" color={theme.textSecondary} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.surfaceSecondary }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  sectionTitle: { paddingHorizontal: Spacing.two },
  card: { borderRadius: Radius.medium, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    minHeight: 56,
  },
  actions: { gap: Spacing.two },
  about: { textAlign: 'center' },
});
