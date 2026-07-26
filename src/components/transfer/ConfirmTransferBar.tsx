import { ApexTokens } from '@/constants/apexTokens';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useA11yAnnounce, MAX_FONT_SCALE } from '@/lib/a11y';
import { openFplTeam } from '@/lib/external';

// Confirming a transfer here saves a PLAN — the app is advisory-only and the
// write-back to FPL is Phase 6 (no public write API). The bar used to call an
// empty TODO and then just sit there, giving no feedback at all. It now shows
// what actually happened and hands off to the official FPL app (#174).
const SAVED = 'Plan saved — apply it in the official FPL app before the deadline';

interface ConfirmTransferBarProps {
  outName: string;
  inName: string;
  // Dismisses the bar. Confirming deliberately does NOT dismiss — the saved
  // state and its FPL handoff have to stay on screen to be tappable.
  onDone: () => void;
  tk: ApexTokens;
}

export function ConfirmTransferBar({ outName, inName, onDone, tk }: ConfirmTransferBarProps) {
  const [saved, setSaved] = useState(false);
  useA11yAnnounce(saved ? SAVED : null);

  if (saved) {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={[styles.bar, styles.savedBar, { backgroundColor: tk.card, borderColor: tk.green }]}
      >
        <Text style={[styles.savedText, { color: tk.text }]}>{SAVED}</Text>
        <View style={styles.savedRow}>
          <Pressable
            onPress={onDone}
            style={[styles.doneBtn, { borderColor: tk.cardBorder }]}
            accessibilityRole="button"
          >
            <Text
              style={[styles.doneText, { color: tk.faint }]}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
            >
              Done
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { openFplTeam(); }}
            style={[styles.btn, styles.grow, { backgroundColor: tk.activeFill }]}
            accessibilityRole="button"
          >
            <Text style={styles.btnText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Open FPL
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View accessibilityLiveRegion="polite" style={[styles.bar, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <View style={styles.swapRow}>
        <Text style={[styles.out, { color: tk.pink }]} numberOfLines={1}>{outName}</Text>
        <Text style={[styles.arrow, { color: tk.faint }]}> → </Text>
        <Text style={[styles.in, { color: tk.green }]} numberOfLines={1}>{inName}</Text>
      </View>
      <Pressable
        onPress={() => setSaved(true)}
        style={[styles.btn, { backgroundColor: tk.activeFill }]}
        accessibilityRole="button"
      >
        <Text style={styles.btnText} maxFontSizeMultiplier={MAX_FONT_SCALE}>Confirm transfer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  savedBar: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    padding: 14,
  },
  savedText: { fontFamily: 'Archivo_600SemiBold', fontSize: 13.5, lineHeight: 19 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swapRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  out: { fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  arrow: { fontFamily: 'Archivo_700Bold', fontSize: 15 },
  in: { fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  btn: {
    borderRadius: 12,
    height: 42,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  doneBtn: {
    borderRadius: 12,
    height: 42,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontFamily: 'Archivo_700Bold', fontSize: 13.5 },
  btnText: { color: '#fff', fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
});
