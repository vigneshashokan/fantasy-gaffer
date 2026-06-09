import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { resendVerification } from '@/lib/auth/email';

const RESEND_COOLDOWN_MS = 30_000;

export default function VerifyPending() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? '';

  const [cooldown, setCooldown] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_MS / 1000);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const onResend = async () => {
    if (cooldown > 0 || !email) return;
    setErrorMsg(null);
    startCooldown();
    const r = await resendVerification(email);
    if (!r.ok && r.error === 'rate_limited') {
      setErrorMsg('Already sent — check your inbox or wait a minute');
    } else if (!r.ok) {
      setErrorMsg("Couldn't resend right now. Please try again");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        <Text style={[styles.title, { color: t.text }]}>Check your inbox</Text>
        <Text style={[styles.body, { color: t.textMuted }]}>
          We sent a verification link to <Text style={{ color: t.text }}>{email}</Text>. Tap the
          link in the email to finish signing up.
        </Text>

        <PillBtn
          variant="accent"
          onPress={onResend}
          accentInk={t.accentInk}
          style={styles.resendBtn}
        >
          {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
        </PillBtn>

        {errorMsg && (
          <Text style={[styles.error, { color: '#FF3B5C' }]}>{errorMsg}</Text>
        )}

        <Pressable
          onPress={() => router.replace('/(onboarding)/signin')}
          hitSlop={8}
          style={styles.linkWrap}
        >
          <Text style={[styles.link, { color: t.accent }]}>Already verified? Sign in</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.linkWrap}>
          <Text style={[styles.link, { color: t.textMuted }]}>Wrong email? Go back</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 26, paddingTop: 64, paddingBottom: 32 },
  logoWrap: { alignItems: 'center', marginBottom: 26 },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 30,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 26,
    lineHeight: 22,
  },
  resendBtn: { width: '100%', height: 54 },
  error: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  linkWrap: { alignItems: 'center', marginTop: 18 },
  link: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
});
