import React, { useEffect, useState } from 'react';
import { View, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { AccountMenu } from '@/components/nav/AccountMenu';
import { FloatingNav, TABS, type TabName } from '@/components/nav/FloatingNav';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { useProfile } from '@/api/profile';
import { initialsOf } from '@/lib/name';
import { apexTokens } from '@/constants/apexTokens';
import { TabCoachmark } from '@/components/onboarding/TabCoachmark';
import { useOfflineStripVisible } from '@/components/OfflineBanner';

const SIGN_OUT_FAILED_TITLE = "Couldn't sign out";
const SIGN_OUT_FAILED_BODY = 'Check your connection and try again.';

export default function TabsLayout() {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);

  const { data: profile } = useProfile();
  const initials = initialsOf(profile?.firstName, profile?.lastName);

  // There's no top banner anymore — the status-bar inset is painted in the
  // screen background so the top stays flush with the content. Every tab uses
  // `tk.bg`, the mock's single page background — `team` used to paint the
  // legacy `t.bg` instead, which made switching tabs flash a different colour.
  //
  // `activeTab` still has to track the router for TabCoachmark. It used to be
  // set only in the tab bar's `onPress`, so any navigation the user didn't tap
  // — a notification deep link, a back-navigation — left it stale, and
  // TabCoachmark showed (and marked seen) the wrong tab's tip. Derive it from
  // the router instead. Non-tab routes (the profile/settings/player modals)
  // contribute no tab segment, so the last tab is kept while they're open.
  const segments = useSegments();
  const [activeTab, setActiveTab] = useState<TabName>('team');
  useEffect(() => {
    const leaf = segments[segments.length - 1];
    if (TABS.some((tab) => tab.name === leaf)) setActiveTab(leaf as TabName);
  }, [segments]);
  const screenBg = tk.bg;

  const [menuOpen, setMenuOpen] = useState(false);

  // The offline strip is docked above this layout and already paints the top
  // safe-area inset; adding our own on top of it doubles the gap.
  const topInset = useOfflineStripVisible() ? 0 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View testID="tabs-top-inset" style={{ height: topInset, backgroundColor: screenBg }} />
      <TabCoachmark tab={activeTab} />
      <Tabs
        initialRouteName="team"
        screenOptions={{ headerShown: false }}
        // The bar is `position:'absolute'`, so it is taken out of the tab
        // navigator's column and floats over the screens — which is what makes
        // the screens full-height and the glass fill worth having. Each tab's
        // scroll content pays for that with FLOATING_NAV_SPACE at the bottom.
        tabBar={(props) => (
          <FloatingNav
            activeName={props.state.routes[props.state.index].name as TabName}
            onSelect={(name) => props.navigation.navigate(name)}
            onAccount={() => setMenuOpen(true)}
            menuOpen={menuOpen}
            initials={initials}
            tk={tk}
          />
        )}
      >
        <Tabs.Screen name="top-picks" />
        <Tabs.Screen name="team" />
        <Tabs.Screen name="transfer" />
      </Tabs>

      <AccountMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onProfile={() => {
          setMenuOpen(false);
          router.push('/profile');
        }}
        onSettings={() => {
          setMenuOpen(false);
          router.push('/settings');
        }}
        onSignOut={async () => {
          setMenuOpen(false);
          // supabase.auth.signOut() RESOLVES with { error } and leaves the
          // local session intact when its remote call fails, so an offline
          // tap used to look like a no-op: the menu closed and nothing else
          // happened. It can also reject outright (it awaits internal
          // init/lock acquisition), so catch that too — same as LockScreen's
          // escape hatch does.
          try {
            const { error } = await signOut();
            if (error) Alert.alert(SIGN_OUT_FAILED_TITLE, SIGN_OUT_FAILED_BODY);
          } catch {
            Alert.alert(SIGN_OUT_FAILED_TITLE, SIGN_OUT_FAILED_BODY);
          }
        }}
      />
    </View>
  );
}
