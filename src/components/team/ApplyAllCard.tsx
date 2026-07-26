import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';
import { useA11yAnnounce, MAX_FONT_SCALE } from '@/lib/a11y';
import { openFplTeam } from '@/lib/external';

// Confirming here saves a PLAN — it does not touch the user's FPL team. The
// app is advisory-only; write-back to FPL is Phase 6 (no public write API), so
// the old "Your team has been updated" copy was flatly false and could cost
// someone their deadline. The saved state now says what really happened and
// hands off to the official FPL app, and it stays put until dismissed rather
// than self-clearing after ~1s, so the handoff is actually tappable (#174).
const SAVED_TITLE = 'Plan saved';
const SAVED_SUB = 'Apply it in the official FPL app before the deadline';

interface ApplyAllCardProps {
  count: number;
  onUndo: () => void;
  onConfirm: () => void;
  tk: ApexTokens;
}

export function ApplyAllCard({ count, onUndo, onConfirm, tk }: ApplyAllCardProps) {
  const [confirmed, setConfirmed] = useState(false);
  useA11yAnnounce(confirmed ? `${SAVED_TITLE}. ${SAVED_SUB}` : null);

  const handleConfirm = () => setConfirmed(true);
  const handleDone = () => {
    setConfirmed(false);
    onConfirm();
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        { backgroundColor: tk.card, borderColor: tk.green },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: tk.greenSoft }]}>
          <Icon
            name={confirmed ? 'check' : 'swap'}
            color={tk.green}
            size={18}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: tk.text }]}>
            {confirmed
              ? SAVED_TITLE
              : `${count} change${count > 1 ? 's' : ''} pending`}
          </Text>
          <Text style={[styles.sub, { color: tk.faint }]}>
            {confirmed ? SAVED_SUB : 'Review and save your plan for this gameweek'}
          </Text>
        </View>
      </View>

      {confirmed ? (
        <View style={styles.btnRow}>
          <Pressable
            onPress={handleDone}
            style={[styles.undoBtn, { borderColor: tk.cardBorder }]}
            accessibilityRole="button"
          >
            <Text
              style={[styles.undoText, { color: tk.faint }]}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
            >
              Done
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { openFplTeam(); }}
            style={[styles.confirmBtn, { backgroundColor: tk.green }]}
            accessibilityRole="button"
          >
            <Text style={styles.confirmText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Open FPL
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.btnRow}>
          <Pressable
            onPress={onUndo}
            style={[styles.undoBtn, undoStyle(tk.dark)]}
            accessibilityRole="button"
          >
            <Text
              style={[styles.undoText, { color: tk.dark ? '#FFC04D' : '#B36B00' }]}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
            >
              Undo all changes
            </Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            style={[styles.confirmBtn, { backgroundColor: tk.green }]}
            accessibilityRole="button"
          >
            <Text style={styles.confirmText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Save plan
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function undoStyle(dark: boolean) {
  return {
    borderColor: dark ? 'rgba(255,176,32,0.5)' : '#F0A500',
    backgroundColor: dark ? 'rgba(255,176,32,0.12)' : 'rgba(245,165,0,0.10)',
  };
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 13,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 15,
    letterSpacing: -0.15,
  },
  sub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    marginTop: 1,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  undoBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13.5,
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    color: '#fff',
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 14,
  },
});
