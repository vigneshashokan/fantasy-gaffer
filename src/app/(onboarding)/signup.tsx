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
import { router } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Field } from '@/components/forms/Field';
import { signUpSchema } from '@/lib/auth/validation';
import { signUpWithEmail } from '@/lib/auth/email';
import { track } from '@/lib/analytics';

type FieldErrors = Partial<Record<
  'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword' | 'form',
  string
>>;

export default function SignUp() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const clearForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setErrors({});
  };

  const goToSignIn = () => {
    clearForm();
    router.back();
  };

  const onSubmit = async () => {
    if (submitting) return;
    setErrors({});
    const parsed = signUpSchema.safeParse({
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      const map: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!map[key]) map[key] = issue.message;
      }
      setErrors(map);
      return;
    }

    setSubmitting(true);
    try {
      const { firstName: fn, lastName: ln, email: em, password: pw } = parsed.data;
      const r = await signUpWithEmail({ firstName: fn, lastName: ln, email: em, password: pw });
      const normalisedEmail = parsed.data.email;
      if (r.ok) {
        track('sign_up', { provider: 'email' });
      }
      if (r.ok || (!r.ok && r.error === 'user_already_exists')) {
        router.replace(
          `/(onboarding)/verify-pending?email=${encodeURIComponent(normalisedEmail)}`,
        );
        return;
      }
      if (r.error === 'weak_password') {
        setErrors({ password: 'Please choose a stronger password' });
      } else if (r.error === 'rate_limited') {
        setErrors({ form: 'Too many sign-up attempts — try again later' });
      } else if (r.error === 'network') {
        setErrors({ form: "Couldn't reach the server. Check your connection and try again" });
      } else {
        setErrors({ form: 'Something went wrong. Please try again' });
      }
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

        <Text style={[styles.title, { color: t.text }]}>Create your account</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          We'll send a link to verify your email
        </Text>

        <View style={{ gap: 11 }}>
          <Field
            icon="person"
            placeholder="First name"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.firstName && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.firstName}</Text>
          )}
          <Field
            icon="person"
            placeholder="Last name"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.lastName && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.lastName}</Text>
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
          {errors.email && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.email}</Text>
          )}
          <Field
            icon="lock"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.password && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.password}</Text>
          )}
          <Field
            icon="lock"
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.confirmPassword && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.confirmPassword}</Text>
          )}
        </View>

        {errors.form && (
          <Text style={[styles.formError, { color: '#FF3B5C' }]}>{errors.form}</Text>
        )}

        <PillBtn
          variant="accent"
          onPress={onSubmit}
          accentInk={t.accentInk}
          style={styles.submitBtn}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </PillBtn>

        <View style={styles.footerWrap}>
          <Text style={[styles.footerHint, { color: t.textMuted }]}>
            Already have an account?{' '}
          </Text>
          <Pressable onPress={goToSignIn} hitSlop={8}>
            <Text style={[styles.footerLink, { color: t.accent }]}>Sign in</Text>
          </Pressable>
        </View>
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
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 26,
  },
  fieldError: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: -4,
    marginLeft: 4,
  },
  formError: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
  },
  submitBtn: { width: '100%', height: 54, marginTop: 22 },
  footerWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  footerHint: { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  footerLink: { fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
});
