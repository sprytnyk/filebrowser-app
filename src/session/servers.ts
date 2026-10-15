import { useSyncExternalStore } from 'react';

import { configureApi } from '@/api/client';
import { type ServerInfo } from '@/api/types';
import i18n from '@/i18n';
import { gatewayHeaders } from '@/lib/gateway';
import { isExpired } from '@/lib/jwt';
import { readJson, StorageKeys, tokenKey, writeJson } from '@/session/storage';

/** A server the app knows, with the account last signed in there. */
export type ServerProfile = {
  id: string;
  server: ServerInfo;
  username: string | null;
  /** Name the user gave this server; the server's own name is used when unset. */
  label?: string | null;
};

type Saved = { profiles: ServerProfile[]; activeId: string | null };

export type ServersState = Saved & {
  /** Session token per profile id; null when signed out. Each lives in its own SecureStore key. */
  tokens: Record<string, string | null>;
};

function newId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function loadToken(id: string): string | null {
  const token = readJson<string>(tokenKey(id));
  if (token && isExpired(token)) {
    writeJson(tokenKey(id), null);
    return null;
  }
  return token;
}

/** Reads the profile list, moving the single-server keys of earlier versions over once. */
function load(): ServersState {
  let saved = readJson<Saved>(StorageKeys.servers);
  if (!saved) {
    const legacy = readJson<ServerInfo>(StorageKeys.legacyServer);
    saved = { profiles: [], activeId: null };
    if (legacy) {
      const id = newId();
      saved = { profiles: [{ id, server: legacy, username: null }], activeId: id };
      writeJson(tokenKey(id), readJson<string>(StorageKeys.legacyToken));
    }
    writeJson(StorageKeys.servers, saved);
    writeJson(StorageKeys.legacyServer, null);
    writeJson(StorageKeys.legacyToken, null);
  }
  const tokens = Object.fromEntries(saved.profiles.map((p) => [p.id, loadToken(p.id)]));
  return { ...saved, tokens };
}

let state = load();
const listeners = new Set<() => void>();

function syncApi() {
  const active = state.profiles.find((p) => p.id === state.activeId) ?? null;
  configureApi({
    baseUrl: active?.server.baseUrl ?? null,
    token: active ? (state.tokens[active.id] ?? null) : null,
    gateway: !!active?.server.gateway,
  });
}
syncApi();

function commit(next: ServersState) {
  state = next;
  writeJson(StorageKeys.servers, { profiles: state.profiles, activeId: state.activeId });
  syncApi();
  listeners.forEach((l) => l());
}

export function getServers(): ServersState {
  return state;
}

export function activeProfile(): ServerProfile | null {
  return state.profiles.find((p) => p.id === state.activeId) ?? null;
}

export function tokenFor(id: string): string | null {
  return state.tokens[id] ?? null;
}

export function setToken(id: string, token: string | null) {
  if (!state.profiles.some((p) => p.id === id)) return;
  writeJson(tokenKey(id), token);
  commit({ ...state, tokens: { ...state.tokens, [id]: token } });
}

/**
 * Adds a server and makes it active. A signed-out profile for the same address is reused, so
 * adding a server twice doesn't leave stale duplicates behind.
 */
export function addProfile(server: ServerInfo, label: string | null = null): string {
  const reuse = state.profiles.find(
    (p) => p.server.baseUrl === server.baseUrl && !state.tokens[p.id],
  );
  const id = reuse?.id ?? newId();
  const profiles = reuse
    ? state.profiles.map((p) => (p.id === id ? { ...p, server, label: label ?? p.label } : p))
    : [...state.profiles, { id, server, username: null, label }];
  commit({ ...state, profiles, activeId: id, tokens: { ...state.tokens, [id]: null } });
  return id;
}

export function updateProfile(id: string, patch: Partial<Omit<ServerProfile, 'id'>>) {
  commit({
    ...state,
    profiles: state.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  });
}

/** Remembers that a server turned out to be behind a sign-in gateway. */
export function markGateway(id: string) {
  const profile = state.profiles.find((p) => p.id === id);
  if (!profile || profile.server.gateway) return;
  updateProfile(id, { server: { ...profile.server, gateway: true } });
}

/** Forgets a profile and its token; the next remaining profile becomes active. */
export function removeProfile(id: string) {
  writeJson(tokenKey(id), null);
  const profiles = state.profiles.filter((p) => p.id !== id);
  const { [id]: _removed, ...tokens } = state.tokens;
  const activeId = state.activeId === id ? (profiles[0]?.id ?? null) : state.activeId;
  commit({ profiles, activeId, tokens });
}

export function setActive(id: string) {
  if (id === state.activeId || !state.profiles.some((p) => p.id === id)) return;
  // Tokens of other servers can run out while they sit in the background.
  const token = state.tokens[id];
  if (token && isExpired(token)) writeJson(tokenKey(id), null);
  commit({
    ...state,
    activeId: id,
    tokens: { ...state.tokens, [id]: token && isExpired(token) ? null : (token ?? null) },
  });
}

/** Address and auth header for a profile, for work that must stay on its server (transfers). */
export function credentialsFor(id: string): {
  baseUrl: string;
  headers: Record<string, string>;
  gateway: boolean;
} {
  const profile = state.profiles.find((p) => p.id === id);
  const token = state.tokens[id];
  if (!profile || !token) throw new Error(i18n.t('mobile.signedOutOfServer'));
  const { baseUrl, gateway } = profile.server;
  return {
    baseUrl,
    headers: { ...(gateway ? gatewayHeaders(baseUrl) : {}), Authorization: `Bearer ${token}` },
    gateway: !!gateway,
  };
}

/** The name shown for a server: the user's own label, else the name the server reports. */
export function profileName(profile: Pick<ServerProfile, 'server' | 'label'>): string {
  return profile.label?.trim() || profile.server.name;
}

/** Turns what the user typed into a label; empty or the server's own name means "no label". */
export function normalizeLabel(value: string, server: ServerInfo): string | null {
  const label = value.trim();
  return label && label !== server.name ? label : null;
}

/** "files.example.com/fb" for lists and captions. */
export function hostLabel(server: ServerInfo): string {
  return server.baseUrl.replace(/^https?:\/\//, '');
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useServers(): ServersState {
  return useSyncExternalStore(subscribe, getServers);
}
