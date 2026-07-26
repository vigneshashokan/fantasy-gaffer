// Bottom-sheet modal explaining where to find an FPL team ID. Three lines
// of copy and a Got-it button. Uses RN's built-in Modal — same pattern as
// AccountMenu.

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';
import { getTheme } from '@/constants/theme';
import { PillBtn } from '@/components/ui/PillBtn';

interface TeamHelpSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function TeamHelpSheet({ visible, onClose }: TeamHelpSheetProps) {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);
  const t = getTheme(paletteKey, dark);

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
        <Text style={[styles.title, { color: tk.text }]}>Finding your team ID</Text>
        <View style={styles.steps}>
          <Text style={[styles.step, { color: tk.text }]}>
            <Text style={styles.bullet}>1.</Text> Open the official FPL app on your phone.
          </Text>
          <Text style={[styles.step, { color: tk.text }]}>
            <Text style={styles.bullet}>2.</Text> Tap My Team in the bottom navigation.
          </Text>
          <Text style={[styles.step, { color: tk.text }]}>
            <Text style={styles.bullet}>3.</Text> Tap the gear icon to open Settings — your team ID
            sits under the team name.
          </Text>
        </View>
        <PillBtn
          variant="accent"
          accentFill={t.accent}
          accentInk={t.accentInk}
          onPress={onClose}
          style={styles.btn}
        >
          Got it
        </PillBtn>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 36,
    borderWidth: 1,
    gap: 14,
  },
  title: { fontFamily: 'Archivo_800ExtraBold', fontSize: 18 },
  steps: { gap: 10 },
  step: { fontFamily: 'Archivo_500Medium', fontSize: 14, lineHeight: 20 },
  bullet: { fontFamily: 'Archivo_700Bold' },
  btn: { marginTop: 8 },
});
