import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { PlusCard } from '@/components/settings/PlusCard';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { FollowUsRow } from '@/components/settings/FollowUsRow';
import { supabase } from '@/lib/supabase';

export default function SettingsModal() {
  const router = useRouter();
  const { paletteKey, dark, setPaletteKey } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  const heroFrom = t.primary;
  const heroTo = dark ? '#0C1018' : '#5B0F63';

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <ScreenHeader
        title="Settings"
        onBack={() => router.back()}
        gradFrom={heroFrom}
        gradTo={heroTo}
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: 18, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <PlusCard gradFrom={heroFrom} gradTo={heroTo} />

        <SectionCard title="Appearance" tk={tk}>
          <ThemeToggle palette={paletteKey} onSetPalette={setPaletteKey} />
        </SectionCard>

        <Text style={[styles.sectionLabel, { color: tk.faint }]}>Preferences</Text>
        <NotificationsCard tk={tk} />

        <SectionCard title="More" tk={tk}>
          <SettingsRow
            icon={<ShareIcon color={tk.faint} />}
            label="Share FPL Gaffer"
            onPress={() => {}}
            tk={tk}
            trailing={<View />}
          />
          <FollowUsRow tk={tk} showDivider />
          <SettingsRow
            icon={<FeedbackIcon color={tk.faint} />}
            label="Send Feedback"
            onPress={() => {}}
            tk={tk}
            showDivider
          />
          <SettingsRow
            icon={<TermsIcon color={tk.faint} />}
            label="Terms & Conditions"
            onPress={() => {}}
            tk={tk}
            external
            showDivider
          />
        </SectionCard>

        <Text style={[styles.version, { color: tk.faint }]}>
          FPL Gaffer · v1.0.0
        </Text>

        {__DEV__ && (
          <SectionCard title="Connectivity (dev)" tk={tk}>
            <Pressable
              onPress={async () => {
                try {
                  const { data, error } = await supabase.functions.invoke('ping');
                  if (error) throw error;
                  Alert.alert('ping ok', JSON.stringify(data));
                } catch (e) {
                  Alert.alert('ping failed', e instanceof Error ? e.message : String(e));
                }
              }}
              style={({ pressed }) => [
                styles.devButton,
                { backgroundColor: tk.headStrip, borderColor: tk.cardBorder, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.devButtonText, { color: tk.text }]}>Ping Edge Function</Text>
            </Pressable>
          </SectionCard>
        )}
      </ScrollView>
    </View>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={18} cy={5} r={2.6} stroke={color} strokeWidth={2} />
      <Circle cx={6} cy={12} r={2.6} stroke={color} strokeWidth={2} />
      <Circle cx={18} cy={19} r={2.6} stroke={color} strokeWidth={2} />
      <Path
        d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function FeedbackIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5.5A8 8 0 1121 12z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TermsIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 3h7l5 5v13H7a1 1 0 01-1-1V4a1 1 0 011-1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 3v5h5M9 13h6M9 17h6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginHorizontal: 20,
    marginBottom: 8,
  },
  version: {
    textAlign: 'center',
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    paddingTop: 4,
    paddingBottom: 28,
  },
  devButton: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  devButtonText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
  },
});
