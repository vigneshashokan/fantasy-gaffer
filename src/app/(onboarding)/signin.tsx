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
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Icon } from '@/components/ui/Icon';
import { Field } from '@/components/forms/Field';
import { SocialBtn } from '@/components/forms/SocialBtn';

export default function SignIn() {
  const router = useRouter();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');

  // Mock handler kept temporarily so the existing buttons compile; replaced
  // in Task 7 by real Google sign-in + "Coming soon" alerts for the rest.
  const handleSignIn = () => {
    router.replace('/(home)/(tabs)/team');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        <Text style={[styles.title, { color: t.text }]}>Welcome, Gaffer!</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Sign in to manage your squad
        </Text>

        <View style={{ gap: 11 }}>
          <SocialBtn provider="google" onPress={handleSignIn} />
          <SocialBtn provider="apple" onPress={handleSignIn} />
        </View>

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
        </View>

        <View style={styles.forgotWrap}>
          <Pressable onPress={() => {}} hitSlop={8}>
            <Text style={[styles.forgot, { color: t.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>

        <PillBtn
          variant="accent"
          onPress={handleSignIn}
          accentInk={t.accentInk}
          style={styles.signInBtn}
        >
          Sign in
        </PillBtn>

        <View style={styles.faceWrap}>
          <Pressable
            onPress={handleSignIn}
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 22,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
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
  forgot: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
  },
  signInBtn: {
    width: '100%',
    height: 54,
  },
  faceWrap: {
    alignItems: 'center',
    gap: 9,
    marginTop: 22,
  },
  faceBtn: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13.5,
  },
});
