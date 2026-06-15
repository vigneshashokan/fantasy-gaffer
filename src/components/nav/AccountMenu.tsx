import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { useProfile } from '@/api/profile';
import { useManager } from '@/api/manager';
import { initialsOf } from '@/lib/name';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { Icon } from '@/components/ui/Icon';

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

  const { data: profile } = useProfile();
  const { data: manager } = useManager();
  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  const initials = initialsOf(profile?.firstName, profile?.lastName);
  const teamName = manager?.name;

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
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
              {fullName}
            </Text>
            {teamName ? (
              <Text style={[styles.team, { color: t.textMuted }]} numberOfLines={1}>
                {teamName}
              </Text>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.segmentedRow,
            { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#E7E9F2' },
          ]}
        >
          {(['light', 'dark'] as const).map((mode) => {
            const active = mode === 'dark' ? dark : !dark;
            return (
              <Pressable
                key={mode}
                onPress={() => setDark(mode === 'dark')}
                style={[
                  styles.segment,
                  active && [
                    styles.segmentActive,
                    { backgroundColor: dark ? '#2D3247' : '#FFFFFF' },
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    active
                      ? { color: t.text, fontFamily: 'Archivo_800ExtraBold' }
                      : { color: t.textMuted },
                  ]}
                >
                  {mode === 'dark' ? 'Dark' : 'Light'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: t.line }]} />
        <Pressable style={styles.row} onPress={onProfile}>
          <Icon name="person" color={t.text} size={18} />
          <Text style={[styles.rowText, { color: t.text }]}>Profile</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={onSettings}>
          <Icon name="gear" color={t.text} size={18} />
          <Text style={[styles.rowText, { color: t.text }]}>Settings</Text>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: t.line }]} />
        <Pressable
          style={styles.row}
          onPress={async () => {
            await useAuthStore.getState().signOut();
            onSignOut();
          }}
        >
          <Icon name="signOut" color="#FF3B5C" size={18} />
          <Text style={[styles.rowText, { color: '#FF3B5C' }]}>Sign out</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 92,
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
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14.5,
  },
  divider: { height: 1 },
  segmentedRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginVertical: 10,
    padding: 3,
    borderRadius: 10,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 7,
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
});
