import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { AccountMenu } from './AccountMenu';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { getTheme } from '@/constants/theme';

export function BrandHeader() {
  const { paletteKey, dark } = useThemeStore();
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const t = getTheme(paletteKey, dark);
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: t.bg,
          borderBottomColor: t.line,
          paddingTop: insets.top + 6,
        },
      ]}
    >
      <View style={styles.row}>
        <GafferLogo size={32} light={dark} />
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={[styles.avatar, { backgroundColor: t.primary }]}
        >
          <Text style={styles.avatarText}>AG</Text>
        </Pressable>
      </View>
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
  header: {
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontFamily: 'Archivo_900Black',
    fontSize: 14,
  },
});
