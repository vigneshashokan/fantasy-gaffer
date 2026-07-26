import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export type SignInResult = { ok: true } | { ok: false; error: string };

// Everything this module could log — OAuth callback URLs, the provider
// authorize URL, provider error detail — is auth material or close to it, and
// console.* in a release build lands in the device log stream (readable via
// Xcode/logcat and any log-forwarding tooling). Gate it all behind __DEV__,
// and never pass a callback URL through even then (#166).
function debug(...args: unknown[]): void {
  if (__DEV__) console.log('[google-oauth]', ...args);
}

export async function signInWithGoogle(): Promise<SignInResult> {
  const redirectTo = makeRedirectUri({ path: 'auth/callback' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    debug('signInWithOAuth error =', error?.message);
    return { ok: false, error: error?.message ?? 'oauth_url_unavailable' };
  }

  // Open in the in-app browser using WebBrowser
  const browserResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  
  if (browserResult.type !== 'success') {
    return { ok: false, error: 'browser_canceled_or_failed' };
  }
  
  const callbackUrl = browserResult.url;

  const { accessToken, refreshToken, error: urlError, errorDescription } = extractTokens(callbackUrl);

  if (urlError) {
    debug('callback URL returned error:', urlError, errorDescription);
    return { ok: false, error: errorDescription || urlError };
  }

  if (!accessToken || !refreshToken) {
    // Deliberately without the URL — that is the one value never worth logging.
    debug('missing tokens in callback URL');
    return { ok: false, error: 'missing_tokens_in_redirect' };
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    debug('setSession error =', sessionError.message);
    return { ok: false, error: sessionError.message };
  }

  return { ok: true };
}

function extractTokens(url: string) {
  const params: Record<string, string> = {};

  // Try parsing hash parameters (implicit flow)
  const hashSplit = url.split('#');
  if (hashSplit.length > 1) {
    const hash = hashSplit[1];
    hash.split('&').forEach((pair) => {
      const [key, val] = pair.split('=');
      if (key && val) {
        params[decodeURIComponent(key)] = decodeURIComponent(val);
      }
    });
  }

  // Try query parameters (PKCE flow fallback or errors)
  const querySplit = url.split('?');
  if (querySplit.length > 1) {
    const query = querySplit[1].split('#')[0];
    query.split('&').forEach((pair) => {
      const [key, val] = pair.split('=');
      if (key && val) {
        params[decodeURIComponent(key)] = decodeURIComponent(val);
      }
    });
  }

  return {
    accessToken: params.access_token,
    refreshToken: params.refresh_token,
    error: params.error,
    errorDescription: params.error_description,
  };
}
