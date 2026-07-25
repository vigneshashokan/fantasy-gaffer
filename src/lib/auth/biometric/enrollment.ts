import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupported, promptBiometric } from '@/lib/auth/biometric/capability';

export type BiometricErrorKind = 'cancel' | 'lockout' | 'unsupported' | 'unknown';

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
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
  return { ok: true, value: undefined };
}

export async function disable(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  } catch {
    /* swallow — clearing is best-effort */
  }
}
