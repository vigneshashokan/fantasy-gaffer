import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { isSupported, promptBiometric } from '@/lib/auth/biometric/capability';
import { saveSession, loadSession, clearSession } from '@/lib/auth/biometric/storage';

export type BiometricErrorKind =
  | 'cancel'
  | 'lockout'
  | 'expired_link'
  | 'no_session'
  | 'unsupported'
  | 'unknown';

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: BiometricErrorKind };

export const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export async function enable(): Promise<Result> {
  if (!(await isSupported())) {
    return { ok: false, error: 'unsupported' };
  }
  const prompt = await promptBiometric('Confirm Face ID to enable');
  if (!prompt.ok) {
    return { ok: false, error: prompt.error === 'lockout' ? 'lockout' : 'cancel' };
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    return { ok: false, error: 'no_session' };
  }
  const s = data.session;
  await saveSession({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    user_id: s.user.id,
  });
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
  return { ok: true, value: undefined };
}

export async function disable(): Promise<void> {
  try {
    await clearSession();
  } catch {
    /* swallow */
  }
  try {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  } catch {
    /* swallow */
  }
}

export async function attemptUnlock(): Promise<Result> {
  const stored = await loadSession();
  if (!stored) return { ok: false, error: 'no_session' };

  const prompt = await promptBiometric('Unlock Fantasy Gaffer with Face ID');
  if (!prompt.ok) {
    if (prompt.error === 'lockout') return { ok: false, error: 'lockout' };
    return { ok: false, error: 'cancel' };
  }

  try {
    const { error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (error) {
      await disable();
      return { ok: false, error: 'expired_link' };
    }
    return { ok: true, value: undefined };
  } catch {
    await disable();
    return { ok: false, error: 'expired_link' };
  }
}

export async function persistCurrentSession(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return;
    const s = data.session;
    await saveSession({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      user_id: s.user.id,
    });
  } catch {
    /* swallow */
  }
}
