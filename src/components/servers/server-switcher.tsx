import { useTranslation } from 'react-i18next';

import { type SheetAction, useActionSheet } from '@/components/ui/action-sheet';
import { HeaderButton } from '@/components/ui/header-button';
import { confirm } from '@/lib/notify';
import { hostLabel, profileName, type ServerProfile, useServers } from '@/session/servers';
import { useSession } from '@/session/session';

/** "admin @ files.example.com", or "files.example.com · Signed out". */
export function useProfileSubtitle() {
  const { t } = useTranslation();
  const { tokens } = useServers();
  return (profile: ServerProfile) =>
    tokens[profile.id]
      ? `${profile.username ?? '…'} @ ${hostLabel(profile.server)}`
      : `${hostLabel(profile.server)} · ${t('mobile.signedOut')}`;
}

/** Name of the server in use (the user's label, else the server's own name). */
export function useServerName(): string {
  const { profiles, activeId } = useSession();
  const active = profiles.find((p) => p.id === activeId);
  return active ? profileName(active) : '';
}

/** Asks before forgetting a server; signs out of it first. */
export function useRemoveServer() {
  const { t } = useTranslation();
  const { removeServer } = useSession();
  return async (profile: ServerProfile) => {
    const ok = await confirm(
      t('mobile.removeServer'),
      t('mobile.removeServerConfirm', { server: profileName(profile) }),
      t('general.delete'),
      true,
    );
    if (ok) await removeServer(profile.id);
  };
}

/**
 * Sheet listing every known server (the active one checked) plus "Add server". With
 * `withRemove`, it also offers to forget the active server (used on the login screen).
 */
export function useServerSwitcher({ withRemove = false } = {}) {
  const { t } = useTranslation();
  const { profiles, activeId, switchTo, startAdding } = useSession();
  const subtitle = useProfileSubtitle();
  const remove = useRemoveServer();
  const menu = useActionSheet();

  function open() {
    const active = profiles.find((p) => p.id === activeId);
    const actions: SheetAction[] = [
      ...profiles.map((p) => ({
        id: `switch:${p.id}`,
        title: profileName(p),
        subtitle: subtitle(p),
        icon: 'dns' as const,
        checked: p.id === activeId,
      })),
      { id: 'add', title: t('mobile.addServer'), icon: 'add' },
      ...(withRemove && active
        ? [
            {
              id: 'remove',
              title: t('mobile.removeServer'),
              icon: 'delete' as const,
              destructive: true,
            },
          ]
        : []),
    ];
    menu.open({
      title: t('mobile.servers'),
      actions,
      onSelect: (id) => {
        if (id === 'add') startAdding();
        else if (id === 'remove' && active) void remove(active);
        else if (id.startsWith('switch:')) switchTo(id.slice('switch:'.length));
      },
    });
  }

  return { open, sheet: menu.sheet };
}

/** Header button for the Files root; only shown once there is more than one server. */
export function ServerSwitchButton() {
  const { t } = useTranslation();
  const { profiles } = useSession();
  const switcher = useServerSwitcher();
  if (profiles.length < 2) return null;
  return (
    <>
      <HeaderButton icon="dns" label={t('mobile.switchServer')} onPress={switcher.open} />
      {switcher.sheet}
    </>
  );
}
