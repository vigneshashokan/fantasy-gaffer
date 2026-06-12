import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import type { ClubCode } from '@/types/fpl';
import { CLUB_COLORS } from '@/constants/clubColors';
import { jerseyForClub } from '@/constants/jerseys';

interface KitProps {
  club: string;
  size?: number;
  capt?: boolean;
  vice?: boolean;
  // `playerName` is kept for backwards compatibility with existing call
  // sites — the jersey lookup is now driven by `club`, so this is unused.
  playerName?: string;
}

export function Kit({ club, size = 46, capt, vice }: KitProps) {
  const c = CLUB_COLORS[club as ClubCode] ?? { kit: '#666', kit2: '#fff', ink: '#fff' };
  const ring = Math.max(2, size * 0.085);

  const jersey = jerseyForClub(club as ClubCode);

  const badge = (capt || vice) ? (
    <View
      style={[
        styles.badge,
        {
          top: -(size * 0.10),
          right: -(size * 0.10),
          width: size * 0.42,
          height: size * 0.42,
          backgroundColor: capt ? '#FFD60A' : '#fff',
        },
      ]}
    >
      <Text style={[styles.badgeText, { fontSize: size * 0.24 }]}>
        {capt ? 'C' : 'V'}
      </Text>
    </View>
  ) : null;

  if (jersey) {
    return (
      <View style={{ position: 'relative', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={jersey} style={{ width: size * 1.2, height: size * 1.2 }} resizeMode="contain" />
        {badge}
      </View>
    );
  }

  return (
    <View style={{ position: 'relative', width: size, height: size }}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            backgroundColor: c.kit,
            borderWidth: ring,
            borderColor: c.kit2,
          },
        ]}
      >
        <Text style={[styles.code, { fontSize: size * 0.32, color: c.ink }]}>{club}</Text>
      </View>
      {badge}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  code: {
    fontFamily: 'Archivo_900Black',
    letterSpacing: -0.42,
    lineHeight: 16,
  },
  badge: {
    position: 'absolute',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  badgeText: {
    fontFamily: 'Archivo_900Black',
    color: '#1a1a1a',
    lineHeight: 14,
  },
});
