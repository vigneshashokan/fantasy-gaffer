import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import { BrandHeader } from '@/components/nav/BrandHeader';
import { useThemeStore } from '@/store/themeStore';
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

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BrandHeader />
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
                    onPress={() => props.navigation.navigate(tab.name)}
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
            </View>
          );
        }}
      >
        <Tabs.Screen name="top-picks" />
        <Tabs.Screen name="team" />
        <Tabs.Screen name="transfer" />
      </Tabs>
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
});
