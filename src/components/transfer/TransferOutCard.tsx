import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import type { ClubCode } from '@/types/fpl';
import { jerseyForClub } from '@/constants/jerseys';
interface TransferOutCardProps {
  name: string;
  clubName: string;
  club: ClubCode;
  price: number;
  points: number;
  captain: boolean;
}

export function TransferOutCard({ name, clubName, club, price, points, captain }: TransferOutCardProps) {
  const jersey = jerseyForClub(club);
  return (
    <View style={styles.card}>
      <View style={styles.jerseyWrap}>
        {jersey && <Image source={jersey} style={styles.jersey} resizeMode="contain" />}
        {captain && (
          <View style={styles.captBadge}>
            <Text style={styles.captText}>C</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {clubName} · £{price.toFixed(1)}m · {points} pts
        </Text>
      </View>
      <View style={styles.outPill}>
        <Text style={styles.outText}>OUT</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0E1421',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  jerseyWrap: { width: 48, height: 48, position: 'relative' },
  jersey: { width: 48, height: 48 },
  captBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FACC15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captText: { fontFamily: 'Archivo_800ExtraBold', fontSize: 10, color: '#1A2236' },
  name: { fontFamily: 'Archivo_800ExtraBold', fontSize: 20, color: '#fff', letterSpacing: -0.3 },
  meta: { fontFamily: 'Archivo_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  outPill: {
    backgroundColor: '#F4516C',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  outText: { fontFamily: 'Archivo_800ExtraBold', fontSize: 13, color: '#fff', letterSpacing: 0.5 },
});
