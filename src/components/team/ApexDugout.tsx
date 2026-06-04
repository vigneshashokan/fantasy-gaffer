import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AvatarDisc } from '@/components/ui/AvatarDisc';
import { PointPill } from '@/components/ui/PointPill';
import { PitchPlayer } from '@/constants/data';

interface ApexDugoutProps {
  players: PitchPlayer[];
  card: string;
  cardBorder: string;
  faint: string;
}

export function ApexDugout({ players, card, cardBorder, faint }: ApexDugoutProps) {
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
        {players.map((p) => (
          <View key={p.name} style={styles.player}>
            <View style={styles.avatarWrap}>
              <AvatarDisc size={42} player={p} glyph={p.gk ? '#00E472' : '#A78BFA'} />
              {p.alert && (
                <View style={[styles.alert, { borderColor: card }]} />
              )}
            </View>
            <PointPill pts={p.pts} name={p.name} />
          </View>
        ))}
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
    fontSize: 12,
    letterSpacing: 1.44,
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
