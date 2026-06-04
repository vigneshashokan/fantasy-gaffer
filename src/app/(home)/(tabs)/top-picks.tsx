import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';

export default function TopPicksTab() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Text style={[styles.title, { color: t.text }]}>Top Picks</Text>
      <Text style={[styles.body, { color: t.textMuted }]}>Coming in Task 6</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontFamily: 'Archivo_900Black', fontSize: 24 },
  body:  { fontFamily: 'Archivo_500Medium', fontSize: 14 },
});
