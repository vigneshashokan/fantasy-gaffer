import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { AUTH_LINK_HOST } from '@/constants/links';

const APP_SCHEME = 'fplgafferreactnativeapp:';

// Mirrors auth-js's EmailOtpType. Declared locally rather than imported:
// @supabase/supabase-js does not re-export it, and reaching into
// @supabase/auth-js would bind us to a transitive package. auth-js widens the
// type with `(string & {})`, so this narrower union is assignable to it.
const OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const;
export type OtpType = (typeof OTP_TYPES)[number];

export type AuthDeepLink =
  | { kind: 'verify'; tokenHash: string | null; type: OtpType }
  | { kind: 'reset'; tokenHash: string | null; type: OtpType }
  | { kind: 'unknown' };

// React Native's URL polyfill does not implement `searchParams`, so pull the
// value out by hand — the same split idiom lib/auth/google.ts uses on the
// OAuth callback. Fragment is stripped first: `?` inside a `#…` part is not
// a query string.
function paramOf(url: string, name: string): string | null {
  const query = url.split('#')[0].split('?')[1];
  if (!query) return null;
  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value && decodeURIComponent(key) === name) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

// The email template chooses the OTP type, so read it from the link rather
// than hardcoding one per route — Supabase's own snippets use `signup` in some
// docs and `email` in others for the same confirmation mail. An absent or
// unrecognised value falls back to the type the route implies.
function otpTypeOf(url: string, fallback: OtpType): OtpType {
  const raw = paramOf(url, 'type');
  return (OTP_TYPES as readonly string[]).includes(raw ?? '')
    ? (raw as OtpType)
    : fallback;
}

// The route segment a link is asking for, or '' if this URL isn't ours.
//
// Two shapes reach here (#71). Universal Links are what Supabase now sends —
// `https://fantasy-gaffer.com/verify?code=…` — and the custom scheme stays
// supported because it is still what Google OAuth redirects to, what the web
// fallback pages' "Open in the app" button uses, and what any email already in
// a user's inbox from before this shipped carries.
//
// The two put the segment in different places: for `scheme://verify` the URL
// parser reports `verify` as the HOST, while for the https form the host is
// the domain and the segment is in the path.
function routeOf(parsed: URL): string {
  if (parsed.protocol === APP_SCHEME) {
    return parsed.host || parsed.pathname.replace(/^\//, '').split('/')[0];
  }
  // Host-checked, not just scheme-checked: without it any https link the OS
  // handed us would be read as an auth callback.
  if (parsed.protocol === 'https:' && parsed.host === AUTH_LINK_HOST) {
    return parsed.pathname.replace(/^\//, '').split('/')[0];
  }
  return '';
}

export function parseAuthDeepLink(url: string): AuthDeepLink {
  try {
    const route = routeOf(new URL(url));
    if (route === 'verify') {
      return {
        kind: 'verify',
        tokenHash: paramOf(url, 'token_hash'),
        type: otpTypeOf(url, 'email'),
      };
    }
    if (route === 'reset-password') {
      return {
        kind: 'reset',
        tokenHash: paramOf(url, 'token_hash'),
        type: otpTypeOf(url, 'recovery'),
      };
    }
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
  // …but that same property means a warm open delivers one URL through BOTH
  // useLinkingURL() and the 'url' listener. An auth code is single-use, so
  // the second exchange always failed — and, before the error check below,
  // failed silently. Remembering what we have acted on keeps it to one.
  // Deliberately a ref, not module state: a remount (e.g. after the
  // biometric lock clears) SHOULD replay a link that arrived while locked.
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!hydrated) return;

    const handle = (url: string) => {
      if (handled.current.has(url)) return;
      const parsed = parseAuthDeepLink(url);
      if (parsed.kind === 'unknown') return;
      handled.current.add(url);

      const expired = () =>
        router.replace(
          parsed.kind === 'reset'
            ? '/(onboarding)/forgot-password?expired=1'
            : '/(onboarding)/signin?verify_expired=1',
        );

      // verifyOtp, NOT exchangeCodeForSession (#71 on-device pass). The latter
      // is a PKCE grant needing the `<storageKey>-code-verifier` auth-js stores
      // when the flow begins — but the client leaves `flowType` at auth-js's
      // default of `implicit`, under which no verifier is ever written, so the
      // exchange could never succeed and every fresh link reported "expired".
      // A token_hash link also lets the email point straight at our own domain,
      // which is what makes the Universal Link fire at all: iOS matches
      // associated domains against the TAPPED url, and the old GoTrue
      // /auth/v1/verify?redirect_to=… form was matched against *.supabase.co,
      // so it always opened Safari and only then redirected to us.
      if (!parsed.tokenHash) {
        expired();
        return;
      }

      supabase.auth
        .verifyOtp({ token_hash: parsed.tokenHash, type: parsed.type })
        .then(({ error }) => {
          // auth-js RESOLVES with { error } for an expired or already-used
          // link — it only rejects on non-auth failures. The resolved error
          // was never inspected, so a dead reset link dropped the user on
          // the reset-password form with no session (the password update
          // then failed with a confusing message), and the `?expired=1`
          // copy these routes carry could never be reached.
          if (error) {
            expired();
            return;
          }
          if (parsed.kind === 'reset') {
            router.replace('/(onboarding)/reset-password');
          }
          // For 'verify', the existing (onboarding)/_layout.tsx redirect
          // picks up the new session and routes the user.
        })
        .catch(expired);
    };

    if (initialUrl) handle(initialUrl);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [hydrated, initialUrl]);
}
