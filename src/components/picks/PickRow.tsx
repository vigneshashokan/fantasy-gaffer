import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import type { TopPickPlayer, Fixture, ClubCode } from '@/types/fpl';
import { jerseyForClub } from '@/constants/jerseys';
import { ApexTokens } from '@/constants/apexTokens';
import { xPtsOf, xpColor } from '@/utils/xpts';

interface PickRowProps {
  p: TopPickPlayer;
  zebra: boolean;
  last: boolean;
  tk: ApexTokens;
  dark: boolean;
  fixtures: Partial<Record<ClubCode, Fixture>>;
  squadNames: Set<string>;
}

export function PickRow({ p, zebra, last, tk, dark, fixtures, squadNames }: PickRowProps) {
  const fx = fixtures[p.club] ?? { opp: '—' as unknown as ClubCode, h: true };
  const owned = squadNames.has(p.name);
  const xp = xPtsOf(p);
  const xpC = xpColor(xp, dark);
  const accentBar = owned
    ? (dark ? '#DDD6FE' : '#C4B5FD')
    : (dark ? '#A78BFA' : '#7C3AED');
  const jersey = jerseyForClub(p.club);

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: zebra ? tk.zebra : 'transparent',
          borderBottomColor: tk.line,
          borderBottomWidth: last ? 0 : 1,
          opacity: owned ? 0.5 : 1,
        },
      ]}
    >
      <View style={[styles.accentBar, { backgroundColor: accentBar }]} />
      {/* Player cell */}
      <View style={styles.playerCell}>
        {jersey && (
          <Image source={jersey} style={styles.jersey} resizeMode="contain" />
        )}
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          {owned && (
            <View
              style={[
                styles.badge,
                { backgroundColor: tk.headStrip, borderColor: tk.line },
              ]}
            >
              <Text style={[styles.badgeText, { color: tk.faint }]}>In team</Text>
            </View>
          )}
          <Text style={[styles.name, { color: tk.text }]} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={[styles.fixture, { color: tk.faint }]} numberOfLines={1}>
            {fx.opp} ({fx.h ? 'H' : 'A'})
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={[styles.priceCell, { borderLeftColor: tk.line, borderLeftWidth: 1 }]}>
        <Text style={[styles.stat, { color: tk.text }]}>£{p.p.toFixed(1)}m</Text>
      </View>
      <View style={styles.formCell}>
        <Text style={[styles.stat, { color: tk.formText }]}>{p.f.toFixed(1)}</Text>
      </View>
      <View style={styles.xpCell}>
        <Text style={[styles.statBold, { color: xpC }]}>{Math.round(xp)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  playerCell: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingLeft: 11,
    paddingRight: 10,
    gap: 6,
  },
  accentBar: {
    width: 4,
    height: '70%',
    alignSelf: 'center',
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  jersey: {
    width: 40,
    height: 40,
  },
  name: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 16,
    letterSpacing: -0.24,
  },
  fixture: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 11.5,
    marginTop: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 3,
  },
  badgeText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 9,
    letterSpacing: 0.36,
    textTransform: 'uppercase',
  },
  priceCell: {
    flex: 0.68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCell: {
    flex: 0.52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpCell: {
    flex: 0.56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stat: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 16,
    letterSpacing: -0.32,
    textAlign: 'center',
  },
  statBold: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 16,
    letterSpacing: -0.32,
    textAlign: 'center',
  },
});
