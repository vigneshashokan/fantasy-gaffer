import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const APP_SCHEME = 'fplgafferreactnativeapp:';

export type AuthDeepLink =
  | { kind: 'verify' }
  | { kind: 'reset' }
  | { kind: 'unknown' };

export function parseAuthDeepLink(url: string): AuthDeepLink {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== APP_SCHEME) return { kind: 'unknown' };
    // For `scheme://host/path`, `parsed.host` is the first path segment.
    const head = parsed.host || parsed.pathname.replace(/^\//, '').split('/')[0];
    if (head === 'verify') return { kind: 'verify' };
    if (head === 'reset-password') return { kind: 'reset' };
    return { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}

export function useEmailAuthDeepLinks(): void {
  const hydrated = useAuthStore((s) => s.hydrated);
  // useLinkingURL() (not the deprecated useURL()) is backed by the native
  // ExpoLinkingRegistry, which is refreshed on every `application(_:open:)`
  // call — cold launch AND a link tapped while the app is already running.
  // useURL()'s initial value only reflects `launchOptions`, which iOS never
  // populates for a warm open, so a link tapped while locked would be
  // silently dropped instead of replayed once this effect mounts on unlock.
  const initialUrl = Linking.useLinkingURL();

  useEffect(() => {
    if (!hydrated) return;

    const handle = (url: string) => {
      const parsed = parseAuthDeepLink(url);
      if (parsed.kind === 'unknown') return;
      supabase.auth
        .exchangeCodeForSession(url)
        .then(() => {
          if (parsed.kind === 'reset') {
            router.replace('/(onboarding)/reset-password');
          }
          // For 'verify', the existing (onboarding)/_layout.tsx redirect
          // picks up the new session and routes the user.
        })
        .catch(() => {
          router.replace(
            parsed.kind === 'reset'
              ? '/(onboarding)/forgot-password?expired=1'
              : '/(onboarding)/signin?verify_expired=1',
          );
        });
    };

    if (initialUrl) handle(initialUrl);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [hydrated, initialUrl]);
}
