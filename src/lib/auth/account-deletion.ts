import { supabase } from '@/lib/supabase';
import { useBiometricStore } from '@/store/biometricStore';

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: 'network' | 'unauthorized' | 'unknown' };

export async function requestDeletion(): Promise<Result> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, error: 'unauthorized' };

  const userId = data.session.user.id;
  const { error } = await supabase
    .from('account_deletions')
    .insert({ user_id: userId });

  // 23505 = unique_violation in Postgres. Idempotent: the row we wanted is
  // already there, so the desired state holds.
  if (error && error.code !== '23505') {
    return { ok: false, error: 'network' };
  }

  // Order matters: INSERT first, then signOut (so a failed sign-out leaves
  // the deletion request landed). Both signOut and biometric disable are
  // best-effort from here.
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch (err) {
    console.warn('[account-deletion] signOut failed (non-fatal):', err);
  }
  try {
    await useBiometricStore.getState().disable();
  } catch (err) {
    console.warn('[account-deletion] biometric disable failed (non-fatal):', err);
  }
  return { ok: true, value: undefined };
}

export async function cancelDeletion(): Promise<Result> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase
    .from('account_deletions')
    .delete()
    .eq('user_id', data.session.user.id);

  if (error) return { ok: false, error: 'network' };
  return { ok: true, value: undefined };
}
