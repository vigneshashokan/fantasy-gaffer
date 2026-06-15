import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, useRouter } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import { AccountMenu } from '@/components/nav/AccountMenu';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { useProfile } from '@/api/profile';
import { initialsOf } from '@/lib/name';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';

type TabName = 'top-picks' | 'team' | 'transfer';

const TABS: { name: TabName; label: string; icon: 'fire' | 'team' | 'swap' }[] = [
  { name: 'top-picks', label: 'Top Picks', icon: 'fire' },
  { name: 'team',      label: 'My Team',   icon: 'team' },
  { name: 'transfer',  label: 'Transfer',  icon: 'swap' },
];

export default function TabsLayout() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);

  const { data: profile } = useProfile();
  const initials = initialsOf(profile?.firstName, profile?.lastName);

  // There's no top banner anymore — the status-bar inset is painted in the
  // active screen's own background colour so the top stays flush with the
  // content. `team` uses the theme bg; the other tabs use the apex token bg.
  const [activeTab, setActiveTab] = useState<TabName>('team');
  const screenBg = activeTab === 'team' ? t.bg : tk.bg;

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <Tabs
        initialRouteName="team"
        screenOptions={{ headerShown: false }}
        tabBar={(props) => {
          const activeName = props.state.routes[props.state.index].name;
          return (
            <View style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.line }]}>
              {TABS.map((tab) => {
                const focused = activeName === tab.name;
                const color = focused ? tk.activeFill : t.textFaint;
                return (
                  <Pressable
                    key={tab.name}
                    style={styles.tab}
                    onPress={() => {
                      setActiveTab(tab.name);
                      props.navigation.navigate(tab.name);
                    }}
                  >
                    {focused && (
                      <View style={[styles.indicator, { backgroundColor: tk.activeFill }]} />
                    )}
                    <Icon name={tab.icon} color={color} size={24} />
                    <Text
                      style={[
                        styles.label,
                        {
                          color,
                          fontFamily: focused
                            ? 'Archivo_800ExtraBold'
                            : 'Archivo_600SemiBold',
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}

              {/* Account opens the account menu popup rather than navigating to
                  a screen, so it carries no active indicator. */}
              <Pressable style={styles.tab} onPress={() => setMenuOpen(true)}>
                <View style={[styles.accountAvatar, { backgroundColor: t.primary }]}>
                  <Text style={styles.accountInitials}>{initials}</Text>
                </View>
                <Text
                  style={[styles.label, { color: t.textFaint, fontFamily: 'Archivo_600SemiBold' }]}
                >
                  Account
                </Text>
              </Pressable>
            </View>
          );
        }}
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
          await signOut();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: 22,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    gap: 4,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 3,
    borderRadius: 999,
  },
  label: {
    fontSize: 11,
  },
  accountAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInitials: {
    color: '#fff',
    fontFamily: 'Archivo_900Black',
    fontSize: 11,
  },
});
