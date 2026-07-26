import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  type TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/auth/google';
import { signInWithApple } from '@/lib/auth/apple';
import { signInWithEmail } from '@/lib/auth/email';
import type { AuthErrorKind } from '@/lib/auth/email';
import { emailSchema } from '@/lib/auth/validation';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Field } from '@/components/forms/Field';
import { SocialBtn } from '@/components/forms/SocialBtn';
import { useA11yAnnounce } from '@/lib/a11y';

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
  const [socialSubmitting, setSocialSubmitting] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  // Keyboard "next" hops to the password field; "go" submits from it (#181).
  const pwRef = useRef<TextInput>(null);
  useA11yAnnounce(submitError);
  useA11yAnnounce(socialError || null);
  // Field-level validation was silent here while forgot-password's identical
  // field announced. iOS needs the imperative announce; the live regions on
  // the error Text nodes cover Android.
  useA11yAnnounce(emailError || passwordError || null);

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
    setSocialError(null);
    setSocialSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (result.ok) return;
      if (result.error === 'cancel' || result.error === 'dismiss') return;
      setSocialError('Google sign-in failed. Please try again.');
    } finally {
      setSocialSubmitting(false);
    }
  };

  const onApple = async () => {
    setSocialError(null);
    setSocialSubmitting(true);
    try {
      const result = await signInWithApple();
      if (result.ok) return;
      // Dismissing the system sheet is a normal outcome, not an error.
      if (result.error === 'cancel') return;
      setSocialError('Apple sign-in failed. Please try again.');
    } finally {
      setSocialSubmitting(false);
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
          {/* Sign in with Apple is iOS/tvOS only — there is no Android or web
              implementation to fall back to, so the button is not rendered. */}
          {Platform.OS === 'ios' && <SocialBtn provider="apple" onPress={onApple} />}
        </View>
        {socialSubmitting && (
          <View style={styles.spinnerWrap}>
            <ActivityIndicator color={t.accent} />
          </View>
        )}
        {socialError && (
          <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: t.danger }]}>{socialError}</Text>
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
            returnKeyType="next"
            onSubmitEditing={() => pwRef.current?.focus()}
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
            testID="signin-email"
          />
          {emailError && (
            <Text accessibilityLiveRegion="assertive" style={[styles.fieldError, { color: t.danger }]}>{emailError}</Text>
          )}
          <Field
            icon="lock"
            placeholder="Password"
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            autoComplete="password"
            inputRef={pwRef}
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
            testID="signin-password"
          />
          {passwordError && (
            <Text accessibilityLiveRegion="assertive" style={[styles.fieldError, { color: t.danger }]}>{passwordError}</Text>
          )}
        </View>

        {submitError && (
          <Text
            accessibilityLiveRegion="assertive"
            style={[styles.error, { color: t.danger }]}
          >
            {submitError}
          </Text>
        )}

        <View style={styles.forgotWrap}>
          <Pressable
            onPress={() => router.push('/(onboarding)/forgot-password')}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[styles.forgot, { color: t.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>

        <PillBtn
          variant="accent"
          onPress={onSubmit}
          accentFill={t.accent}
          accentInk={t.accentInk}
          style={styles.signInBtn}
          testID="signin-submit"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </PillBtn>

        <View style={styles.signUpWrap}>
          <Text style={[styles.signUpHint, { color: t.textMuted }]}>
            Don't have an account?{' '}
          </Text>
          <Pressable onPress={goToSignUp} hitSlop={8} accessibilityRole="button">
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
  signUpWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 26,
  },
  signUpHint: { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  signUpLink: { fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
});
