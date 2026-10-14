import { Redirect } from 'expo-router';

import { useSession } from '@/session/session';

/**
 * The app's start URL ("filebrowserapp:///"). Nothing lives here; it sends you to whichever
 * screen the session allows, the same way the guards in _layout.tsx do.
 */
export default function Index() {
  const { server, token, adding, switching } = useSession();
  if (switching) return <Redirect href="/switching" />;
  if (!server || adding) return <Redirect href="/setup/server" />;
  if (!token) return <Redirect href="/setup/login" />;
  return <Redirect href="/files" />;
}
