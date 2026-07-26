import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { isSupported, promptBiometric } from '@/lib/auth/biometric/capability';
import { useBiometricStore } from '@/store/biometricStore';
import { useAuthStore } from '@/store/authStore';
import { useA11yAnnounce } from '@/lib/a11y';

const CANCELLED = 'Face ID cancelled. Try again, or sign out to use your password.';
const LOCKED_OUT = 'Too many attempts. Sign out and use your password.';
const SIGN_OUT_FAILED = "Couldn't sign out. Check your connection and try again.";

export function LockScreen() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const unlock = useBiometricStore((s) => s.unlock);
  const disable = useBiometricStore((s) => s.disable);
  const signOut = useAuthStore((s) => s.signOut);

  const [status, setStatus] = useState<string | null>(null);
  // Guards against stacked system sheets: a second authenticateAsync while one
  // is pending kills the first with system_cancel, which the capability layer
  // maps to 'cancel' and swallows. Observed live while verifying #73.
  const inFlight = useRef(false);
  useA11yAnnounce(status);

  const attempt = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (!(await isSupported())) {
        // Face ID was disabled or re-enrolled in iOS Settings, so the stored
        // preference can never be satisfied again. Clear it and let the user
        // through rather than trapping them behind a prompt that always fails.
        // Not a bypass: changing Face ID enrollment requires the device passcode.
        await disable();
        unlock();
        return;
      }
      const r = await promptBiometric('Unlock Fantasy Gaffer');
      if (r.ok) {
        unlock();
        return;
      }
      setStatus(r.error === 'lockout' ? LOCKED_OUT : CANCELLED);
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    attempt();
    // Mount-only: the lock is resolved once per launch, and retry is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // supabase.auth.signOut() usually resolves { error } and, on a network
  // failure, leaves the local session intact — no SIGNED_OUT event fires, so
  // `locked` never flips and this button would otherwise appear dead.
  // Surface that through the same status line as the biometric prompt. It
  // can also *reject* (it awaits internal init/lock acquisition, either of
  // which can throw on a lock timeout) rather than resolving with { error }
  // — catch that case too, or the button goes dead the same way.
  const handleSignOut = async () => {
    try {
      const { error } = await signOut();
      if (error) setStatus(SIGN_OUT_FAILED);
    } catch {
      setStatus(SIGN_OUT_FAILED);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <GafferLogo size={46} light={dark} variant="wordmark" />
      <Text style={[styles.title, { color: t.text }]}>Locked</Text>
      <Text style={[styles.subtitle, { color: t.textMuted }]}>
        Unlock with Face ID to continue.
      </Text>

      {status && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.status, { color: t.textMuted }]}
        >
          {status}
        </Text>
      )}

      <PillBtn
        variant="accent"
        onPress={attempt}
        accentFill={t.accent}
        accentInk={t.accentInk}
        style={styles.btn}
      >
        Unlock with Face ID
      </PillBtn>
      <PillBtn variant="ghost" onPress={handleSignOut} textColor={t.textMuted} style={styles.btn}>
        Sign out
      </PillBtn>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    gap: 12,
  },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 30,
    letterSpacing: -0.6,
    marginTop: 20,
  },
  subtitle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  status: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 6,
  },
  btn: { width: '100%', height: 54 },
});
