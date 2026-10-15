import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import * as authApi from '@/api/auth';
import { ApiError, configureApi } from '@/api/client';
import { fetchGlobals, isSupportedVersion } from '@/api/server';
import { type ServerInfo, type User } from '@/api/types';
import { getSelf } from '@/api/users';
import i18n from '@/i18n';
import { gatewaySignInOpen, openGatewaySignIn, openGatewaySignOut } from '@/lib/gateway';
import { shouldRenew } from '@/lib/jwt';
import { showMessage } from '@/lib/notify';
import {
  activeProfile,
  addProfile,
  credentialsFor,
  getServers,
  profileName,
  removeProfile,
  type ServerProfile,
  markGateway,
  setActive,
  setToken,
  tokenFor,
  updateProfile,
  useServers,
} from '@/session/servers';

type SessionContextValue = {
  server: ServerInfo | null;
  token: string | null;
  profiles: ServerProfile[];
  activeId: string | null;
  /** Whether the "add server" form is showing on top of an existing session. */
  adding: boolean;
  /** True for a moment while changing servers, so the signed-in screens unmount first. */
  switching: boolean;
  /** One-shot message for the login screen, e.g. "session expired". */
  notice: string | null;
  /**
   * Whether the login screen may sign in through a gateway by itself. Off after an explicit sign
   * out, so the user isn't signed straight back in.
   */
  gatewayAuto: boolean;
  /** Adds a probed server and makes it active (signed out until login). */
  connect: (server: ServerInfo, label?: string | null) => void;
  startAdding: () => void;
  cancelAdding: () => void;
  switchTo: (id: string) => void;
  /** Signs out of a server (best effort) and forgets it. */
  removeServer: (id: string) => Promise<void>;
  signIn: (token: string, username: string) => void;
  signOut: (notice?: string) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const RENEW_CHECK_MS = 5 * 60 * 1000;

export function SessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { profiles, activeId, tokens } = useServers();
  const active = profiles.find((p) => p.id === activeId) ?? null;
  const server = active?.server ?? null;
  const token = active ? (tokens[active.id] ?? null) : null;
  const [notice, setNotice] = useState<string | null>(null);
  const [gatewayAuto, setGatewayAuto] = useState(true);
  const [adding, setAdding] = useState(false);
  // Changing servers happens in two renders: first the signed-in screens are taken off the
  // stack (dropping the old server's folders and tabs), then the new server becomes active.
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!pendingSwitch) return;
    const timer = setTimeout(() => {
      pendingSwitch();
      setPendingSwitch(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [pendingSwitch]);

  const signOut = useCallback(
    async (message?: string) => {
      const current = activeProfile();
      if (!current) return;
      const logoutUrl = await authApi.logout();
      setToken(current.id, null);
      queryClient.clear();
      setNotice(message ?? null);
      setGatewayAuto(false);
      // End the gateway's session too, or the next sign-in would skip its login page.
      if (current.server.gateway && logoutUrl) {
        setTimeout(() => openGatewaySignOut(logoutUrl), 0);
      }
    },
    [queryClient],
  );

  const expireSession = useCallback(() => {
    const current = activeProfile();
    if (current) setToken(current.id, null);
    queryClient.clear();
    setNotice(i18n.t('mobile.sessionExpired'));
  }, [queryClient]);

  // The gateway's own session ran out mid-use: show its sign-in page, then refresh. Backing out
  // holds off asking again for a minute, so a screen full of requests doesn't keep reopening it.
  const gatewayQuietUntil = useRef(0);
  const onGateway = useCallback(() => {
    const current = activeProfile();
    if (!current || gatewaySignInOpen() || Date.now() < gatewayQuietUntil.current) return;
    markGateway(current.id);
    void openGatewaySignIn(current.server.baseUrl).then((ok) => {
      if (ok) void queryClient.invalidateQueries();
      else gatewayQuietUntil.current = Date.now() + 60_000;
    });
  }, [queryClient]);

  useEffect(() => {
    configureApi({ onUnauthorized: expireSession, onGateway });
  }, [expireSession, onGateway]);

  const connect = useCallback(
    (next: ServerInfo, label: string | null = null) => {
      queryClient.clear();
      addProfile(next, label);
      setAdding(false);
      setNotice(null);
      setGatewayAuto(true);
    },
    [queryClient],
  );

  const switchTo = useCallback(
    (id: string) => {
      if (id === getServers().activeId) return;
      setAdding(false);
      setPendingSwitch(() => () => {
        queryClient.clear();
        setActive(id);
        setNotice(tokenFor(id) ? null : i18n.t('mobile.signedOutOfServer'));
        setGatewayAuto(true);
      });
    },
    [queryClient],
  );

  const removeServer = useCallback(
    async (id: string) => {
      const token = tokenFor(id);
      if (token) {
        await authApi.logout({
          baseUrl: credentialsFor(id).baseUrl,
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      setNotice(null);
      if (id !== getServers().activeId) {
        removeProfile(id);
        return;
      }
      setPendingSwitch(() => () => {
        queryClient.clear();
        removeProfile(id);
      });
    },
    [queryClient],
  );

  const signIn = useCallback((next: string, username: string) => {
    const current = activeProfile();
    if (!current) return;
    setNotice(null);
    setGatewayAuto(true);
    // Signing in to the same account again replaces its older profile.
    for (const p of getServers().profiles) {
      if (
        p.id !== current.id &&
        p.server.baseUrl === current.server.baseUrl &&
        p.username === username
      ) {
        removeProfile(p.id);
      }
    }
    updateProfile(current.id, { username });
    setToken(current.id, next);
    // The server only reveals its version to signed-in users.
    void fetchGlobals(current.server.baseUrl, next).then((globals) => {
      const latest = getServers().profiles.find((p) => p.id === current.id);
      if (!latest) return;
      updateProfile(current.id, { server: { ...latest.server, ...globals } });
      if (!isSupportedVersion(globals.version)) {
        showMessage(
          profileName(latest),
          i18n.t('mobile.versionWarning', { version: globals.version }),
        );
      }
    });
  }, []);

  // Renew tokens on foreground and periodically once half their lifetime has passed. Servers in
  // the background are kept alive too, so switching back doesn't ask for a password again.
  const renewing = useRef(new Set<string>());
  const signedIn = Object.values(tokens).some(Boolean);
  useEffect(() => {
    if (!signedIn) return;
    const renewOne = async (id: string, current: string) => {
      if (renewing.current.has(id) || !shouldRenew(current)) return;
      renewing.current.add(id);
      try {
        setToken(id, await authApi.renew(credentialsFor(id)));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          if (id === getServers().activeId) expireSession();
          else setToken(id, null);
        }
        // Network errors retry on the next tick.
      } finally {
        renewing.current.delete(id);
      }
    };
    const renewAll = () => {
      for (const [id, current] of Object.entries(getServers().tokens)) {
        if (current) void renewOne(id, current);
      }
    };
    renewAll();
    const interval = setInterval(renewAll, RENEW_CHECK_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') renewAll();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [signedIn, expireSession]);

  const startAdding = useCallback(() => setAdding(true), []);
  const cancelAdding = useCallback(() => setAdding(false), []);

  const value = useMemo(
    () => ({
      server,
      token,
      profiles,
      activeId,
      adding,
      switching: pendingSwitch !== null,
      notice,
      gatewayAuto,
      connect,
      startAdding,
      cancelAdding,
      switchTo,
      removeServer,
      signIn,
      signOut,
    }),
    [
      server,
      token,
      profiles,
      activeId,
      adding,
      pendingSwitch,
      notice,
      gatewayAuto,
      connect,
      startAdding,
      cancelAdding,
      switchTo,
      removeServer,
      signIn,
      signOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** The signed-in user, including per-source permissions (`scopes`). */
export function useSelf() {
  const { token } = useSession();
  return useQuery<User>({
    queryKey: ['self'],
    queryFn: getSelf,
    enabled: !!token,
    // Permissions can change on the server at any time; refresh on foreground and refetch.
    staleTime: 30 * 1000,
  });
}

/** Server returned to the signed-in part of the app, where it is always set. */
export function useServer(): ServerInfo {
  const { server } = useSession();
  if (!server) throw new Error('No server configured');
  return server;
}
