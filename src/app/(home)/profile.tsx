import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { PROFILE } from '@/constants/data';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { Icon } from '@/components/ui/Icon';
import { ReadField } from '@/components/profile/ReadField';
import { GenderRow } from '@/components/profile/GenderRow';
import { ToggleRow } from '@/components/profile/ToggleRow';
import { ChangePassword } from '@/components/profile/ChangePassword';
import { DeleteAccount } from '@/components/profile/DeleteAccount';
import { isSupported as biometricIsSupported } from '@/lib/auth/biometric/capability';
import { useBiometricStore } from '@/store/biometricStore';

export default function ProfileModal() {
  const router = useRouter();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);
  const [gender, setGender] = useState(PROFILE.gender);
  const biometricEnabled = useBiometricStore((s) => s.enabled);
  const biometricEnable = useBiometricStore((s) => s.enable);
  const biometricDisable = useBiometricStore((s) => s.disable);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    biometricIsSupported().then((v) => {
      if (!cancelled) setSupported(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const heroFrom = t.primary;
  const heroTo = dark ? '#0C1018' : '#5B0F63';
  const initials = `${PROFILE.firstName[0]}${PROFILE.lastName[0]}`;

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <ScreenHeader
        title="Profile"
        onBack={() => router.back()}
        gradFrom={heroFrom}
        gradTo={heroTo}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {PROFILE.firstName} {PROFILE.lastName}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {PROFILE.email}
            </Text>
          </View>
        </View>
      </ScreenHeader>

      <ScrollView
        contentContainerStyle={{ paddingTop: 18, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <SectionCard title="Personal details" tk={tk}>
          <ReadField label="First name" value={PROFILE.firstName} tk={tk} />
          <ReadField label="Last name" value={PROFILE.lastName} tk={tk} showDivider />
          <ReadField label="Date of birth" value={PROFILE.dob} tk={tk} showDivider />
          <GenderRow value={gender} onChange={setGender} tk={tk} />
          <ReadField label="Email address" value={PROFILE.email} tk={tk} showDivider />
        </SectionCard>

        <SectionCard title="Security" tk={tk}>
          <ChangePassword tk={tk} />
          {supported && (
            <ToggleRow
              label="Face ID login"
              sub={
                biometricEnabled ? 'Biometric sign-in is on' : 'Use password to sign in'
              }
              value={biometricEnabled}
              onChange={(v) => (v ? biometricEnable() : biometricDisable())}
              tk={tk}
              showDivider
              icon={<Icon name="faceid" color={tk.faint} size={20} />}
            />
          )}
        </SectionCard>

        <Text style={[styles.dangerLabel, { color: tk.faint }]}>Danger zone</Text>
        <DeleteAccount tk={tk} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontFamily: 'Archivo_900Black',
    fontSize: 21,
  },
  name: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 21,
    color: '#fff',
    letterSpacing: -0.21,
  },
  email: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  dangerLabel: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginHorizontal: 20,
    marginBottom: 8,
  },
});
