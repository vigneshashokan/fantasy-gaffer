import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import Svg, { Path, Circle } from 'react-native-svg';
import { useThemeStore } from '@/store/themeStore';
import { getTheme, GUTTER } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { PlusCard } from '@/components/settings/PlusCard';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { BiometricCard } from '@/components/settings/BiometricCard';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { PrivacyCard } from '@/components/settings/PrivacyCard';
import { useOnboardingStore } from '@/store/onboardingStore';
import { sendTestNotification } from '@/lib/notifications/sendTestNotification';
import { shareApp, sendFeedback } from '@/lib/external';
import { FEEDBACK_EMAIL } from '@/constants/links';

export default function SettingsModal() {
  const router = useRouter();
  const { paletteKey, dark, setPaletteKey } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);
  const resetOnboarding = useOnboardingStore((s) => s.resetAll);

  const heroFrom = t.primary;
  const heroTo = tk.heroBg2;

  return (
    // One scroll view with the header as its first child, the same shape as
    // the profile sheet. A fixed header ABOVE a flexible ScrollView does not
    // size correctly inside a form sheet — the scroll view takes the whole
    // sheet and draws straight over the header.
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.bg }}
      contentContainerStyle={{ paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
    >
      {/* No back chevron: this is a sheet now, so the grabber at the top, the
          drag-down and the scrim are the way out — same call as profile and
          the player detail. The title stays; unlike profile there is no hero
          identity block underneath it saying which screen this is. */}
      <ScreenHeader title="Settings" gradFrom={heroFrom} gradTo={heroTo} />

      <View style={{ height: 18 }} />

      <PlusCard gradFrom={heroFrom} gradTo={heroTo} />

      <SectionCard title="Appearance" tk={tk}>
        <ThemeToggle palette={paletteKey} onSetPalette={setPaletteKey} />
      </SectionCard>

      <Text style={[styles.sectionLabel, { color: tk.faint }]}>Preferences</Text>
      <NotificationsCard tk={tk} />
      <BiometricCard tk={tk} />
      <PrivacyCard tk={tk} />

      <SectionCard title="More" tk={tk}>
        <SettingsRow
          icon={<ShareIcon color={tk.faint} />}
          label="Share Fantasy Gaffer"
          onPress={() => {
            shareApp().catch(() => {});
          }}
          tk={tk}
          // Hands off to the system share sheet, so it reads as external —
          // it used to render no trailing glyph at all, while "Send
          // Feedback" (which leaves for the mail app) got an in-app chevron.
          external
        />
        {/* The "Follow Us" accordion lived here with five social rows whose
            onPress was `() => {}` — external-link affordances pointing at
            handles that don't exist yet. Removed rather than faked; add it
            back (with real URLs) when the accounts are live. (#174) */}
        <SettingsRow
          icon={<FeedbackIcon color={tk.faint} />}
          label="Send Feedback"
          onPress={async () => {
            const { ok } = await sendFeedback();
            if (!ok) Alert.alert('No mail app', `Email us at ${FEEDBACK_EMAIL}`);
          }}
          tk={tk}
          external
          showDivider
        />
        <SettingsRow
          icon={<PrivacyIcon color={tk.faint} />}
          label="Privacy Policy"
          onPress={() => router.push('/legal/privacy')}
          tk={tk}
          showDivider
        />
        <SettingsRow
          icon={<TermsIcon color={tk.faint} />}
          label="Terms of Service"
          onPress={() => router.push('/legal/terms')}
          tk={tk}
          showDivider
        />
        <SettingsRow
          icon={<TutorialIcon color={tk.faint} />}
          label="Replay tutorial"
          onPress={() => {
            resetOnboarding();
            Alert.alert('Tutorial reset', "You'll see the tips again next time you open each tab.");
          }}
          tk={tk}
          showDivider
        />
      </SectionCard>

      {/* Read from the build rather than hardcoded, so a bug report's
          version string is the version the user is actually running (#181). */}
      <Text style={[styles.version, { color: tk.faint }]}>
        Fantasy Gaffer · v{Constants.expoConfig?.version ?? '—'}
      </Text>

      {/* Kept while #158 still owes an on-device push pass: local
          notifications are the only way to fire one and watch the deep link
          route without a push server. The sibling "Connectivity (dev)" card
          went — it pinged the `ping` edge function, which nothing else calls,
          and every real screen already fails loudly when Supabase is
          unreachable. Delete this one too once that pass is signed off. */}
      {__DEV__ && (
        <SectionCard title="Notifications (dev)" tk={tk}>
          <Text style={[styles.devHint, { color: tk.faint }]}>
            Fires a local notification in 4s. Background the app to test a
            background/cold-start tap, or tap the banner — either should deep-link.
          </Text>
          <Pressable
            onPress={async () => {
              const r = await sendTestNotification({
                title: 'Deadline approaching',
                body: 'GW deadline in 1 hour — set your team.',
                url: '/(home)/(tabs)/transfer',
                type: 'deadline',
              });
              Alert.alert(
                r.scheduled ? 'Scheduled' : 'Notifications not enabled',
                r.scheduled
                  ? 'Deadline test → Transfer tab in 4s'
                  : 'Allow when prompted, or enable for this app in iOS Settings → Notifications, then retry.',
              );
            }}
            style={({ pressed }) => [
              styles.devButton,
              { backgroundColor: tk.headStrip, borderColor: tk.cardBorder, opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.devButtonText, { color: tk.text }]}>
              Test deadline → Transfer tab
            </Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              const r = await sendTestNotification({
                title: 'Team confirmed',
                body: 'Your XI is locked in for the gameweek.',
                url: '/(home)/(tabs)/team',
                type: 'gw_confirm',
              });
              Alert.alert(
                r.scheduled ? 'Scheduled' : 'Notifications not enabled',
                r.scheduled
                  ? 'GW-confirm test → Team tab in 4s'
                  : 'Allow when prompted, or enable for this app in iOS Settings → Notifications, then retry.',
              );
            }}
            style={({ pressed }) => [
              styles.devButton,
              { backgroundColor: tk.headStrip, borderColor: tk.cardBorder, opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.devButtonText, { color: tk.text }]}>
              Test gw_confirm → Team tab
            </Text>
          </Pressable>
        </SectionCard>
      )}
    </ScrollView>
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

function PrivacyIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TutorialIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.6.45 1.1 1.2 1.1 2.2h5a2.6 2.6 0 011.1-2.2A6 6 0 0012 3z"
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
    marginHorizontal: GUTTER + 4,
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
    marginHorizontal: GUTTER,
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
  devHint: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: GUTTER,
    marginTop: 4,
    marginBottom: 6,
  },
});
