import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Kit } from './Kit';
import type { Player } from '@/types/fpl';

interface PlayerTokenProps {
  pl: Player;
  onPress?: () => void;
  showStat?: 'gw' | 'price';
  kitSize?: number;
}

export function PlayerToken({ pl, onPress, showStat = 'gw', kitSize = 46 }: PlayerTokenProps) {
  const stat = showStat === 'price'
    ? `£${pl.p.toFixed(1)}`
    : `${pl.capt ? pl.gw * 2 : pl.gw}`;
  const statBg = showStat === 'price' ? '#fff' : '#00E676';
  const statColor = showStat === 'price' ? '#23042B' : '#06351E';

  return (
    <Pressable onPress={onPress} style={styles.container}>
      <Kit club={pl.club} size={kitSize} capt={pl.capt} vice={pl.vice} playerName={pl.name} />
      <View style={styles.label}>
        <View style={styles.nameBar}>
          <Text style={styles.nameText} numberOfLines={1}>{pl.name}</Text>
        </View>
        <View style={[styles.statBar, { backgroundColor: statBg }]}>
          <Text style={[styles.statText, { color: statColor }]}>{stat}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
    width: 76,
  },
  label: {
    width: 70,
    borderRadius: 7,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    marginTop: 1,
  },
  nameBar: {
    backgroundColor: 'rgba(15,0,20,0.92)',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  nameText: {
    color: '#fff',
    fontFamily: 'Archivo_700Bold',
    fontSize: 12.5,
    textAlign: 'center',
    letterSpacing: -0.125,
  },
  statBar: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  statText: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 12.5,
    textAlign: 'center',
  },
});
