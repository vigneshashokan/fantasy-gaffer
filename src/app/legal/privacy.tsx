import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { LegalDocView } from '@/components/legal/LegalDocView';
import { privacyPolicy } from '@/content/legal';

export default function PrivacyScreen() {
  const router = useRouter();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <ScreenHeader
        title={privacyPolicy.title}
        onBack={() => router.back()}
        gradFrom={t.primary}
        gradTo={dark ? '#0C1018' : '#5B0F63'}
      />
      <LegalDocView doc={privacyPolicy} tk={tk} />
    </View>
  );
}
