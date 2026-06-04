import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';

interface AccountMenuProps {
  visible: boolean;
  onClose: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onSignOut: () => void;
}

export function AccountMenu({
  visible,
  onClose,
  onProfile,
  onSettings,
  onSignOut,
}: AccountMenuProps) {
  const { paletteKey, dark, setDark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible={visible}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        style={[
          styles.card,
          { backgroundColor: t.surface, borderColor: tk.cardBorder },
        ]}
      >
        <View style={[styles.identity, { borderBottomColor: t.line }]}>
          <View style={[styles.avatar, { backgroundColor: t.primary }]}>
            <Text style={styles.avatarText}>AG</Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
              A. Gaffer
            </Text>
            <Text style={[styles.team, { color: t.textMuted }]} numberOfLines={1}>
              Apex Pitch FC
            </Text>
          </View>
        </View>

        <Pressable style={[styles.row, styles.toggleRow]} onPress={() => setDark(!dark)}>
          <Text style={[styles.rowText, { color: t.text }]}>
            {dark ? 'Dark mode' : 'Light mode'}
          </Text>
          <View style={[styles.toggle, { backgroundColor: dark ? tk.activeFill : t.line }]}>
            <View style={[styles.knob, { left: dark ? 20 : 2 }]} />
          </View>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: t.line }]} />
        <Pressable style={styles.row} onPress={onProfile}>
          <Text style={[styles.rowText, { color: t.text }]}>Profile</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={onSettings}>
          <Text style={[styles.rowText, { color: t.text }]}>Settings</Text>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: t.line }]} />
        <Pressable style={styles.row} onPress={onSignOut}>
          <Text style={[styles.rowText, { color: '#FF3B5C' }]}>Sign out</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 96,
    right: 16,
    width: 244,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontFamily: 'Archivo_900Black',
    fontSize: 14,
  },
  name: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 15,
  },
  team: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toggleRow: { justifyContent: 'space-between' },
  rowText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14.5,
  },
  divider: { height: 1 },
  toggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    position: 'relative',
  },
  knob: {
    position: 'absolute',
    top: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
});
