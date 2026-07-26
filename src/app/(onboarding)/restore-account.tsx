import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import {
  loadPendingDeletion,
  cancelDeletion,
  type PendingDeletion,
} from '@/lib/auth/account-deletion';

export default function RestoreAccount() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [pending, setPending] = useState<PendingDeletion | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPendingDeletion().then((p) => {
      if (cancelled) return;
      setPending(p);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Once loaded with no pending row (cron may have already swept), bounce home.
  useEffect(() => {
    if (loaded && pending === null) {
      router.replace('/(home)/(tabs)/team');
    }
  }, [loaded, pending]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('first_name')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFirstName(data?.first_name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const onRestore = async () => {
    if (restoring) return;
    setError(null);
    setRestoring(true);
    try {
      const r = await cancelDeletion();
      if (r.ok) {
        router.replace('/(home)/(tabs)/team');
        return;
      }
      setError("Couldn't restore your account. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const onCancel = async () => {
    await signOut();
    router.replace('/(onboarding)/signin');
  };

  const greeting = firstName ? `Welcome back, ${firstName}` : 'Welcome back';
  const days = pending?.daysRemaining ?? 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        {loaded && pending !== null && (
          <>
            <Text style={[styles.title, { color: t.text }]}>{greeting}</Text>

            <Text style={[styles.body, { color: t.textMuted }]}>
              Your account is deleted but can still be restored within {days} days.
              After that, it will be permanently removed.
            </Text>

            <Text style={[styles.question, { color: t.text }]}>
              Do you want to restore your deleted account?
            </Text>

            <PillBtn
              variant="accent"
              onPress={onRestore}
              accentFill={t.accent}
              accentInk={t.accentInk}
              style={styles.restoreBtn}
            >
              {restoring ? 'Restoring…' : 'Restore my account'}
            </PillBtn>

            {error && (
              <Text style={[styles.error, { color: t.danger }]}>{error}</Text>
            )}

            <Pressable onPress={onCancel} hitSlop={8} style={styles.cancelWrap}>
              <Text style={[styles.cancelText, { color: t.textMuted }]}>Cancel</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 26, paddingTop: 64, paddingBottom: 32 },
  logoWrap: { alignItems: 'center', marginBottom: 26 },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 28,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 18,
  },
  body: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 22,
  },
  question: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 22,
  },
  restoreBtn: { width: '100%', height: 54 },
  error: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  cancelWrap: { alignItems: 'center', marginTop: 22 },
  cancelText: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
});
