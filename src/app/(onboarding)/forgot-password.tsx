import React, { useState } from 'react';
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
import { Field } from '@/components/forms/Field';
import { emailSchema } from '@/lib/auth/validation';
import { sendPasswordReset } from '@/lib/auth/email';

export default function ForgotPassword() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const params = useLocalSearchParams<{ expired?: string }>();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (submitting) return;
    setEmailError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError('Enter a valid email');
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordReset(parsed.data);
      setSentEmail(parsed.data);
      setSent(true);
    } finally {
      setSubmitting(false);
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

        {sent ? (
          <>
            <Text style={[styles.title, { color: t.text }]}>Check your inbox</Text>
            <Text style={[styles.body, { color: t.textMuted }]}>
              If an account exists for <Text style={{ color: t.text }}>{sentEmail}</Text>, we've
              sent a reset link. Check your inbox (and spam folder) in the next minute.
            </Text>
            <PillBtn
              variant="accent"
              onPress={() => router.replace('/(onboarding)/signin')}
              accentInk={t.accentInk}
              style={styles.submitBtn}
            >
              Back to sign in
            </PillBtn>
            <View style={styles.signUpWrap}>
              <Text style={[styles.signUpHint, { color: t.textMuted }]}>
                Don't have an account yet?{' '}
              </Text>
              <Pressable
                onPress={() => router.replace('/(onboarding)/signup')}
                hitSlop={8}
              >
                <Text style={[styles.signUpLink, { color: t.accent }]}>Sign up</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: t.text }]}>Reset your password</Text>
            <Text style={[styles.body, { color: t.textMuted }]}>
              Enter your email and we'll send a link to set a new password.
            </Text>

            {params.expired === '1' && (
              <Text style={[styles.banner, { color: t.textMuted }]}>
                That reset link has expired — request a new one.
              </Text>
            )}

            <Field
              icon="mail"
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              surfaceAlt={t.surfaceAlt}
              line={t.line}
              accent={t.accent}
              text={t.text}
              textMuted={t.textMuted}
            />
            {emailError && (
              <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{emailError}</Text>
            )}

            <PillBtn
              variant="accent"
              onPress={onSubmit}
              accentInk={t.accentInk}
              style={styles.submitBtn}
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </PillBtn>
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
    marginBottom: 12,
  },
  body: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 22,
  },
  banner: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
  },
  fieldError: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: 6,
    marginLeft: 4,
  },
  submitBtn: { width: '100%', height: 54, marginTop: 18 },
  signUpWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  signUpHint: { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  signUpLink: { fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
});
