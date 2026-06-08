import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInWithGoogle(): Promise<SignInResult> {
  const redirectTo = makeRedirectUri({ path: 'auth/callback' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    console.log('[google-oauth] signInWithOAuth error =', error?.message, 'data =', data);
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
    console.log('[google-oauth] callback URL returned error:', urlError, errorDescription);
    return { ok: false, error: errorDescription || urlError };
  }

  if (!accessToken || !refreshToken) {
    console.log('[google-oauth] missing tokens in callback URL:', callbackUrl);
    return { ok: false, error: 'missing_tokens_in_redirect' };
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    console.log('[google-oauth] setSession error =', sessionError.message);
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
