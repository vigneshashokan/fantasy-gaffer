import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/auth/google';
import { signInWithEmail } from '@/lib/auth/email';
import type { AuthErrorKind } from '@/lib/auth/email';
import { emailSchema } from '@/lib/auth/validation';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Icon } from '@/components/ui/Icon';
import { Field } from '@/components/forms/Field';
import { SocialBtn } from '@/components/forms/SocialBtn';

const COMING_SOON = () =>
  Alert.alert('Coming soon', 'This sign-in option is in a future update.');

function errorMessageFor(kind: AuthErrorKind): string {
  switch (kind) {
    case 'invalid_credentials':
      return 'Email or password is incorrect';
    case 'rate_limited':
      return 'Too many attempts — try again in a few minutes';
    case 'network':
      return "Couldn't reach the server. Check your connection and try again";
    default:
      return 'Something went wrong. Please try again';
  }
}

export default function SignIn() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const params = useLocalSearchParams<{ verify_expired?: string }>();

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const clearForm = () => {
    setEmail('');
    setPw('');
    setEmailError(null);
    setPasswordError(null);
    setSubmitError(null);
  };

  const goToSignUp = () => {
    clearForm();
    router.push('/(onboarding)/signup');
  };

  const onGoogle = async () => {
    setGoogleError(null);
    setGoogleSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (result.ok) return;
      if (result.error === 'cancel' || result.error === 'dismiss') return;
      setGoogleError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitError(null);

    const trimmedEmail = email.trim();
    let fieldInvalid = false;
    if (trimmedEmail.length === 0) {
      setEmailError("Email can't be empty");
      fieldInvalid = true;
    } else if (!emailSchema.safeParse(trimmedEmail).success) {
      setEmailError('Enter a valid email');
      fieldInvalid = true;
    } else {
      setEmailError(null);
    }
    if (pw.length === 0) {
      setPasswordError("Password can't be empty");
      fieldInvalid = true;
    } else {
      setPasswordError(null);
    }
    if (fieldInvalid) return;

    const normalisedEmail = trimmedEmail.toLowerCase();
    setSubmitting(true);
    try {
      const r = await signInWithEmail(normalisedEmail, pw);
      if (r.ok) return; // (onboarding)/_layout redirects on session change
      if (r.error === 'email_not_confirmed') {
        router.push(
          `/(onboarding)/verify-pending?email=${encodeURIComponent(normalisedEmail)}`,
        );
        return;
      }
      setSubmitError(errorMessageFor(r.error));
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

        <Text style={[styles.title, { color: t.text }]}>Welcome, Gaffer!</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Sign in to manage your squad
        </Text>

        {params.verify_expired === '1' && (
          <Text style={[styles.banner, { color: t.textMuted }]}>
            Verification link expired. Sign in again to resend.
          </Text>
        )}

        <View style={{ gap: 11 }}>
          <SocialBtn provider="google" onPress={onGoogle} />
          <SocialBtn provider="apple" onPress={COMING_SOON} />
        </View>
        {googleSubmitting && (
          <View style={styles.spinnerWrap}>
            <ActivityIndicator color={t.accent} />
          </View>
        )}
        {googleError && (
          <Text style={[styles.error, { color: '#FF3B5C' }]}>{googleError}</Text>
        )}

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: t.line }]} />
          <Text style={[styles.dividerText, { color: t.textFaint }]}>OR</Text>
          <View style={[styles.dividerLine, { backgroundColor: t.line }]} />
        </View>

        <View style={{ gap: 11 }}>
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
          <Field
            icon="lock"
            placeholder="Password"
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {passwordError && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{passwordError}</Text>
          )}
        </View>

        {submitError && (
          <Text style={[styles.error, { color: '#FF3B5C' }]}>{submitError}</Text>
        )}

        <View style={styles.forgotWrap}>
          <Pressable
            onPress={() => router.push('/(onboarding)/forgot-password')}
            hitSlop={8}
          >
            <Text style={[styles.forgot, { color: t.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>

        <PillBtn
          variant="accent"
          onPress={onSubmit}
          accentInk={t.accentInk}
          style={styles.signInBtn}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </PillBtn>

        <View style={styles.faceWrap}>
          <Pressable
            onPress={COMING_SOON}
            style={({ pressed }) => [
              styles.faceBtn,
              { backgroundColor: t.surfaceAlt, borderColor: t.line },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
          >
            <Icon name="faceid" color={t.accent} size={32} />
          </Pressable>
          <Text style={[styles.faceLabel, { color: t.textMuted }]}>
            Sign in with Face ID
          </Text>
        </View>

        <View style={styles.signUpWrap}>
          <Text style={[styles.signUpHint, { color: t.textMuted }]}>
            Don't have an account?{' '}
          </Text>
          <Pressable onPress={goToSignUp} hitSlop={8}>
            <Text style={[styles.signUpLink, { color: t.accent }]}>Sign up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 26,
    paddingTop: 64,
    paddingBottom: 32,
  },
  logoWrap: { alignItems: 'center', marginBottom: 26 },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 30,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 26,
  },
  banner: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
  },
  spinnerWrap: { marginTop: 10, alignItems: 'center' },
  error: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  fieldError: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: -4,
    marginLeft: 4,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 22,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12.5,
    letterSpacing: 1.25,
  },
  forgotWrap: {
    alignItems: 'flex-end',
    marginTop: 12,
    marginBottom: 18,
  },
  forgot: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
  signInBtn: { width: '100%', height: 54 },
  faceWrap: { alignItems: 'center', gap: 9, marginTop: 22 },
  faceBtn: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceLabel: { fontFamily: 'Archivo_700Bold', fontSize: 13.5 },
  signUpWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 26,
  },
  signUpHint: { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  signUpLink: { fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
});
