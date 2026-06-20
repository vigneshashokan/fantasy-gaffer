import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Field } from '@/components/forms/Field';
import { supabase } from '@/lib/supabase';

const COPPA_MIN_AGE_YEARS = 13;

function ageYears(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export default function CompleteProfile() {
  const session = useAuthStore((s) => s.session);
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);

  // Pre-fill from OAuth metadata (Google's `profile` scope payload).
  const meta = (session?.user.user_metadata ?? {}) as Record<string, string | undefined>;
  const [firstName, setFirstName] = useState(meta.given_name ?? '');
  const [lastName, setLastName] = useState(meta.family_name ?? '');
  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const valid = useMemo(() => {
    if (firstName.trim().length === 0) return false;
    if (lastName.trim().length === 0) return false;
    if (!dob) return false;
    if (ageYears(dob) < COPPA_MIN_AGE_YEARS) return false;
    return true;
  }, [firstName, lastName, dob]);

  const onSubmit = async () => {
    if (!session || !valid || !dob || submitting) return;
    setSubmitting(true);
    try {
      const isoDob = dob.toISOString().slice(0, 10);
      const { error: profileError } = await supabase.from('profiles').insert({
        user_id: session.user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        dob: isoDob,
      });
      if (profileError && profileError.code !== '23505') {
        Alert.alert("Couldn't save your profile", profileError.message);
        setSubmitting(false);
        return;
      }
      const { error: prefsError } = await supabase
        .from('notification_prefs')
        .insert({ user_id: session.user.id });
      if (prefsError && prefsError.code !== '23505') {
        console.warn('notification_prefs insert failed (non-fatal):', prefsError.message);
      }
      router.replace('/(onboarding)/connect-team');
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  const submitDisabled = !valid || submitting;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>
        <Text style={[styles.title, { color: t.text }]}>One last step</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Tell us your name and date of birth.
        </Text>

        <View style={{ gap: 11 }}>
          <Field
            icon="person"
            placeholder="First name"
            value={firstName}
            onChangeText={setFirstName}
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          <Field
            icon="person"
            placeholder="Last name"
            value={lastName}
            onChangeText={setLastName}
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          <Pressable
            onPress={() => setShowPicker(true)}
            style={({ pressed }) => [
              styles.dobBtn,
              { backgroundColor: t.surfaceAlt, borderColor: t.line, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.dobText, { color: dob ? t.text : t.textMuted }]}>
              {dob ? dob.toLocaleDateString() : 'Date of birth'}
            </Text>
          </Pressable>
          {showPicker && (
            <DateTimePicker
              value={dob ?? new Date(2000, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onChange={(_event, selected) => {
                if (Platform.OS !== 'ios') setShowPicker(false);
                if (selected) setDob(selected);
              }}
            />
          )}
          {dob && ageYears(dob) < COPPA_MIN_AGE_YEARS ? (
            <Text style={[styles.error, { color: '#FF3B5C' }]}>
              You must be 13 or older to use Fantasy Gaffer.
            </Text>
          ) : (
            <Text style={[styles.dobHelper, { color: t.textMuted }]}>
              We need this to confirm you&apos;re 13 or older to use Fantasy Gaffer.
            </Text>
          )}
        </View>

        <View style={[styles.submitWrap, { opacity: submitDisabled ? 0.5 : 1 }]}>
          <PillBtn
            variant="accent"
            onPress={onSubmit}
            accentInk={t.accentInk}
            style={styles.submitBtn}
          >
            {submitting ? 'Saving...' : 'Continue'}
          </PillBtn>
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
  logoWrap: {
    alignItems: 'center',
    marginBottom: 26,
  },
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
  dobBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  dobText: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
  },
  error: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    marginTop: -4,
  },
  dobHelper: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12.5,
    marginTop: -4,
    paddingHorizontal: 2,
  },
  submitWrap: {
    marginTop: 22,
  },
  submitBtn: {
    width: '100%',
    height: 54,
  },
});
