import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import type { SignInResult } from '@/lib/auth/google';

// Same rule as google.ts: identity tokens and provider error detail are auth
// material, and console.* in a release build lands in the device log stream.
// Never log the token itself, even under __DEV__ (#166).
function debug(...args: unknown[]): void {
  if (__DEV__) console.log('[apple-auth]', ...args);
}

/**
 * Native Sign in with Apple.
 *
 * Unlike Google this never opens a browser: iOS presents the system sheet and
 * hands back a signed identity token, which Supabase verifies directly. So
 * there is no redirect URI, no `exchangeCodeForSession`, and #14's "backend
 * token-exchange endpoint" dependency does not exist — `signInWithIdToken`
 * does the whole exchange. iOS/tvOS only; the caller gates on Platform.
 */
export async function signInWithApple(): Promise<SignInResult> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    // Dismissing the sheet is a normal outcome, not a failure — the caller
    // shows no error for it, matching the Google cancel path.
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, error: 'cancel' };
    }
    debug('signInAsync failed, code =', (e as { code?: string })?.code);
    return { ok: false, error: 'apple_sign_in_failed' };
  }

  if (!credential.identityToken) {
    debug('credential carried no identityToken');
    return { ok: false, error: 'missing_identity_token' };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) {
    debug('signInWithIdToken error =', error.message);
    return { ok: false, error: error.message };
  }

  // Apple returns the name ONLY on the very first authorization for this app —
  // never again, not even after a reinstall — and it is not in the identity
  // token, so Supabase cannot pick it up. Stash it in user_metadata under the
  // keys complete-profile already reads for Google (`given_name`/`family_name`)
  // so the prefill works for both providers with no extra storage.
  const { givenName, familyName } = credential.fullName ?? {};
  if (givenName || familyName) {
    const { error: metaError } = await supabase.auth.updateUser({
      data: { given_name: givenName ?? '', family_name: familyName ?? '' },
    });
    // Non-fatal: the user is signed in either way and can type the name on the
    // complete-profile screen. Losing the session over a prefill would be worse.
    if (metaError) debug('updateUser (name capture) error =', metaError.message);
  }

  return { ok: true };
}
