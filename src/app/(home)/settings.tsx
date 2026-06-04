import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';

export default function SettingsModal() {
  const router = useRouter();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Text style={[styles.title, { color: t.text }]}>Settings</Text>
      <Text style={[styles.body, { color: t.textMuted }]}>Coming in Task 8</Text>
      <Pressable onPress={() => router.back()} style={[styles.btn, { backgroundColor: t.primary }]}>
        <Text style={styles.btnText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  title:     { fontFamily: 'Archivo_900Black', fontSize: 24 },
  body:      { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  btn:       { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13 },
  btnText:   { color: '#fff', fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
});
