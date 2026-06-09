import { supabase } from '@/lib/supabase';

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network'
  | 'user_already_exists'
  | 'weak_password'
  | 'expired_link'
  | 'unknown';

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: AuthErrorKind };

function classify(err: { code?: string; status?: number; message?: string }): AuthErrorKind {
  if (err.code === 'invalid_credentials') return 'invalid_credentials';
  if (err.code === 'email_not_confirmed') return 'email_not_confirmed';
  if (err.code === 'user_already_exists') return 'user_already_exists';
  if (err.code === 'weak_password') return 'weak_password';
  if (err.code === 'otp_expired' || err.code === 'expired_link') return 'expired_link';
  if (err.status === 429 || err.code === 'over_request_rate_limit' || err.code === 'over_email_send_rate_limit') {
    return 'rate_limited';
  }
  return 'unknown';
}

function classifyThrown(err: unknown): AuthErrorKind {
  const msg = err instanceof Error ? err.message : String(err);
  if (/network/i.test(msg) || /fetch/i.test(msg)) return 'network';
  return 'unknown';
}

export async function signInWithEmail(email: string, password: string): Promise<Result> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: classify(error) };
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: classifyThrown(err) };
  }
}

export async function signUpWithEmail(args: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<Result> {
  try {
    const { error } = await supabase.auth.signUp({
      email: args.email,
      password: args.password,
      options: {
        data: { given_name: args.firstName, family_name: args.lastName },
        emailRedirectTo: 'fplgafferreactnativeapp://verify',
      },
    });
    if (error) return { ok: false, error: classify(error) };
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: classifyThrown(err) };
  }
}

export async function sendPasswordReset(email: string): Promise<Result> {
  // Always-success from the caller's perspective: never enumerate accounts.
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'fplgafferreactnativeapp://reset-password',
    });
    if (error) {
      console.warn('[auth] resetPasswordForEmail returned error (swallowed):', error.message);
    }
  } catch (err) {
    console.warn('[auth] resetPasswordForEmail threw (swallowed):', err);
  }
  return { ok: true, value: undefined };
}

export async function resetPassword(newPassword: string): Promise<Result> {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: classify(error) };
  } catch (err) {
    return { ok: false, error: classifyThrown(err) };
  }
  // Best-effort: invalidate other devices. Don't roll back if this fails.
  try {
    await supabase.auth.signOut({ scope: 'others' });
  } catch (err) {
    console.warn('[auth] signOut(others) failed after password reset (non-fatal):', err);
  }
  return { ok: true, value: undefined };
}
