import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface PointPillProps {
  pts?: number | null;
  name: string;
  upcoming?: boolean;
  maxWidth?: number;
  /** FPL bonus 0–3; >= 1 swaps the points disc for a gold star. */
  bonus?: number;
}

export function PointPill({
  pts,
  name,
  upcoming = false,
  maxWidth = 96,
  bonus,
}: PointPillProps) {
  const played = pts != null;
  const hasBonus = !upcoming && played && (bonus ?? 0) >= 1;
  const numBg = played ? '#7B09E5' : 'rgba(255,255,255,0.22)';
  return (
    <View style={[styles.container, { maxWidth }]}>
      {!upcoming && (
        <View style={[styles.num, { backgroundColor: numBg }]}>
          {/* Gold ring + glow flags bonus while leaving the number readable. */}
          {hasBonus && <View style={styles.bonusRing} pointerEvents="none" testID="bonus-star" />}
          <Text style={styles.numText}>{played ? String(pts) : '–'}</Text>
        </View>
      )}
      <Text
        style={[styles.name, { color: played || upcoming ? '#fff' : '#C4CAD6' }]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgb(19,27,46)',
    borderRadius: 999,
    paddingVertical: 1,
    paddingLeft: 1,
    paddingRight: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  num: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // Gold ring (inner edge hugs the 14×14 disc) plus a soft gold glow, so bonus
  // reads as a golden halo around the points without obscuring the number.
  // Bonus: a solid gold disc with a dark number and a soft gold glow so it pops
  // off the dark pill (same disc shape as a normal score, just golden).
  // Bonus: a plain gold ring whose inner edge hugs the 14×14 disc, flagging
  // bonus without obscuring the number (no glow).
  bonusRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#FFC400',
  },
  numText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 12,
    color: '#fff',
  },
  name: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    letterSpacing: -0.12,
    // No flexShrink: the name keeps its full width so the pill grows to fit it
    // (and overflows the fixed avatar slot) instead of truncating to the slot.
  },
});
