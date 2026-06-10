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
    // Surface the raw Postgres error so misapplied migrations (e.g. 42P01
    // = relation does not exist) or RLS denials (42501) are obvious in the
    // dev console next time. The screen shows a generic message — this
    // tells us what actually failed.
    console.warn('[account-deletion] INSERT failed:', error);
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

  if (error) {
    console.warn('[account-deletion] DELETE failed:', error);
    return { ok: false, error: 'network' };
  }
  return { ok: true, value: undefined };
}

export interface PendingDeletion {
  requestedAt: Date;
  daysRemaining: number; // clamped at 0; never negative
}

const GRACE_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function loadPendingDeletion(): Promise<PendingDeletion | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return null;

    const { data, error } = await supabase
      .from('account_deletions')
      .select('requested_at')
      .eq('user_id', sessionData.session.user.id)
      .maybeSingle();

    if (error) {
      console.warn('[account-deletion] SELECT failed:', error);
      return null;
    }
    if (!data) return null;

    const requestedAt = new Date(data.requested_at);
    const expiresAt = requestedAt.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY;
    const daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / MS_PER_DAY));

    return { requestedAt, daysRemaining };
  } catch {
    return null;
  }
}
