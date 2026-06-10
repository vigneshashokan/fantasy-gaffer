import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricKind = 'face' | 'fingerprint' | 'iris';

export type PromptResult =
  | { ok: true }
  | { ok: false; error: 'cancel' | 'lockout' | 'unknown' };

export async function isSupported(): Promise<boolean> {
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && enrolled;
  } catch {
    return false;
  }
}

export async function supportedTypes(): Promise<BiometricKind[]> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const out: BiometricKind[] = [];
    for (const t of types) {
      if (t === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) out.push('face');
      else if (t === LocalAuthentication.AuthenticationType.FINGERPRINT) out.push('fingerprint');
      else if (t === LocalAuthentication.AuthenticationType.IRIS) out.push('iris');
    }
    return out;
  } catch {
    return [];
  }
}

export async function promptBiometric(reason: string): Promise<PromptResult> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Use password',
      disableDeviceFallback: true,
    });
    if (r.success) return { ok: true };
    // Surface the raw OS error so we can tell user_cancel (user dismissed)
    // from system_cancel (OS dismissed — often a permission or transition
    // issue) from not_available (no NSFaceIDUsageDescription in Info.plist
    // or permission denied in iOS Settings).
    console.warn('[biometric] authenticateAsync returned non-success:', r);
    if (r.error === 'user_cancel' || r.error === 'system_cancel') {
      return { ok: false, error: 'cancel' };
    }
    if (r.error === 'lockout') return { ok: false, error: 'lockout' };
    return { ok: false, error: 'unknown' };
  } catch (err) {
    console.warn('[biometric] authenticateAsync threw:', err);
    return { ok: false, error: 'unknown' };
  }
}
