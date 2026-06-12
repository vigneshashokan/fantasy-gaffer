// Bottom-sheet modal explaining where to find an FPL team ID. Three lines
// of copy and a Got-it button. Uses RN's built-in Modal — same pattern as
// AccountMenu.

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';

interface TeamHelpSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function TeamHelpSheet({ visible, onClose }: TeamHelpSheetProps) {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);

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
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: '#7C3AED', opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.btnText}>Got it</Text>
        </Pressable>
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
  btn: {
    paddingVertical: 13,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { fontFamily: 'Archivo_700Bold', fontSize: 14.5, color: '#fff' },
});
