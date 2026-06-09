import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Field } from '@/components/forms/Field';
import { resetPasswordSchema } from '@/lib/auth/validation';
import { resetPassword } from '@/lib/auth/email';

type FieldErrors = Partial<Record<'password' | 'confirmPassword' | 'form', string>>;

export default function ResetPassword() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const session = useAuthStore((s) => s.session);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  if (!session) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.logoWrap}>
            <GafferLogo size={46} light={dark} variant="wordmark" />
          </View>
          <Text style={[styles.title, { color: t.text }]}>Link expired</Text>
          <Text style={[styles.body, { color: t.textMuted }]}>
            Open the link from your email to reset your password.
          </Text>
          <PillBtn
            variant="accent"
            onPress={() => router.replace('/(onboarding)/signin')}
            accentInk={t.accentInk}
            style={styles.submitBtn}
          >
            Back to sign in
          </PillBtn>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const onSubmit = async () => {
    if (submitting) return;
    setErrors({});
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
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
      const r = await resetPassword(parsed.data.password);
      if (r.ok) {
        router.replace('/(home)/(tabs)/team');
        return;
      }
      if (r.error === 'weak_password') {
        setErrors({ password: 'Please choose a stronger password' });
      } else if (r.error === 'expired_link') {
        setErrors({ form: 'This reset link has expired — request a new one' });
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

        <Text style={[styles.title, { color: t.text }]}>Set a new password</Text>
        <Text style={[styles.body, { color: t.textMuted }]}>
          Other devices will be signed out after you update your password.
        </Text>

        <View style={{ gap: 11 }}>
          <Field
            icon="lock"
            placeholder="New password"
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
          {submitting ? 'Updating…' : 'Update password'}
        </PillBtn>
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
});
