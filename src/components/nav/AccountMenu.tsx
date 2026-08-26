import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, BackHandler } from 'react-native';
import { useThemeStore, type ColorScheme } from '@/store/themeStore';
import { useProfile } from '@/api/profile';
import { useManager } from '@/api/manager';
import { initialsOf } from '@/lib/name';
import { FLOATING_NAV_SPACE, getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { Icon } from '@/components/ui/Icon';
import { MAX_FONT_SCALE } from '@/lib/a11y';

const SCHEMES: { key: ColorScheme; label: string; icon: 'device' | 'sun' | 'moon' }[] = [
  { key: 'system', label: 'System', icon: 'device' },
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
];

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
  const { paletteKey, dark, scheme, setScheme } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  const { data: profile } = useProfile();
  const { data: manager } = useManager();
  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  const initials = initialsOf(profile?.firstName, profile?.lastName);
  const teamName = manager?.name;

  // Android's back button was the <Modal>'s onRequestClose; an overlay has to
  // claim it itself or back pops the route out from under an open menu.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  // Deliberately NOT a react-native <Modal>: every row here opens a route that
  // is itself a native modal presentation, and iOS will not present one while
  // another is dismissing — so the menu's fade had to finish before Profile or
  // Settings could even start, a full second of dead time. An overlay in the
  // ordinary tree has nothing to dismiss.
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
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
          {/* Selection tracks the CHOICE, not the resolved theme: on 'System'
              neither Light nor Dark is highlighted, even though one of them is
              in force. Highlighting the resolved one would leave no way to see
              that the app is following the device. */}
          {SCHEMES.map(({ key, label, icon }) => {
            const active = scheme === key;
            return (
              <Pressable
                key={key}
                onPress={() => setScheme(key)}
                accessibilityRole="button"
                accessibilityLabel={`${label} theme`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.segment,
                  active && [
                    styles.segmentActive,
                    { backgroundColor: dark ? '#2D3247' : '#FFFFFF' },
                  ],
                ]}
              >
                <Icon name={icon} color={active ? t.text : t.textMuted} size={13} />
                {/* One line, capped scale: three segments in a fixed-width
                    card, so a wrapped label would push the menu around. */}
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[
                    styles.segmentText,
                    active
                      ? { color: t.text, fontFamily: 'Archivo_800ExtraBold' }
                      : { color: t.textMuted },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: t.line }]} />
        <Pressable style={styles.row} onPress={onProfile} accessibilityRole="button">
          <Icon name="person" color={t.text} size={18} />
          <Text style={[styles.rowText, { color: t.text }]}>Profile</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={onSettings} accessibilityRole="button" testID="account-menu-settings">
          <Icon name="gear" color={t.text} size={18} />
          <Text style={[styles.rowText, { color: t.text }]}>Settings</Text>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: t.line }]} />
        {/* Sign-out is the parent's job — it owns the whole sequence
            (close the menu, await signOut, surface a failure). Calling the
            store here as well ran supabase.auth.signOut() twice and reset
            analytics twice for one tap. */}
        <Pressable
          style={styles.row}
          onPress={onSignOut}
          accessibilityRole="button"
          testID="account-menu-signout"
        >
          <Icon name="signOut" color={t.danger} size={18} />
          <Text style={[styles.rowText, { color: t.danger }]}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    // Sits clear of the floating nav's top edge.
    bottom: FLOATING_NAV_SPACE + 8,
    right: 16,
    // 244 fitted two segments; three with icons need the room.
    width: 268,
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
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 13,
  },
});
