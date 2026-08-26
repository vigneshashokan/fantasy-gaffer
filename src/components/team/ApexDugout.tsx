import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AvatarDisc } from '@/components/ui/AvatarDisc';
import { PointPill } from '@/components/ui/PointPill';
import type { PitchPlayer } from '@/types/fpl';

interface ApexDugoutProps {
  players: PitchPlayer[];
  card: string;
  cardBorder: string;
  faint: string;
  /** Avatar fallback glyph (no club jersey). Pass `tk.green` / `tk.purple`. */
  glyphGk: string;
  glyph: string;
  onPlayerPress?: (p: PitchPlayer) => void;
}

// The dugout is a themed card, not the pitch, so its glyphs take theme tokens —
// the previous literals were classic-palette colours bleeding into pitch and
// electric (#188), and #A78BFA measured 2.72:1 on a light card besides.
export function ApexDugout({
  players,
  card,
  cardBorder,
  faint,
  glyphGk,
  glyph,
  onPlayerPress,
}: ApexDugoutProps) {
  return (
    <View style={[styles.container, { backgroundColor: card, borderColor: cardBorder }]}>
      <View style={styles.header}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3 10h18M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3M4 10l-1 9M20 10l1 9M3 19h18"
            stroke={faint}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={[styles.headerText, { color: faint }]}>Dugout</Text>
      </View>
      <View style={styles.row}>
        {players.map((p) => {
          const body = (
            <>
              <View style={styles.avatarWrap}>
                <AvatarDisc size={42} player={p} glyph={p.gk ? glyphGk : glyph} />
                {p.alert && (
                  <View style={[styles.alert, { borderColor: card }]} />
                )}
              </View>
              <PointPill pts={p.pts} name={p.name} />
            </>
          );
          if (!onPlayerPress) {
            return (
              <View key={p.id} style={styles.player}>
                {body}
              </View>
            );
          }
          return (
            <Pressable
              key={p.id}
              style={({ pressed }) => [
                styles.player,
                pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
              ]}
              onPress={() => onPlayerPress(p)}
            >
              {body}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  headerText: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 1.38,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  player: {
    alignItems: 'center',
    gap: 7,
    width: 70,
  },
  avatarWrap: {
    position: 'relative',
    width: 42,
    height: 42,
  },
  alert: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FF3B3B',
    borderWidth: 1.5,
  },
});
