import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { ClubCode, Position } from '@/types/fpl';
import { Kit } from '@/components/ui/Kit';

interface PlayerHeroProps {
  name: string;
  club: ClubCode;
  clubName: string;
  pos: Position;
  price: number;
  ownership: number;
  tk: ApexTokens;
}

export function PlayerHero({ name, club, clubName, pos, price, ownership, tk }: PlayerHeroProps) {
  return (
    <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <Kit club={club} size={72} playerName={name} />
      <Text style={[styles.name, { color: tk.text }]}>{name}</Text>
      <Text style={[styles.club, { color: tk.faint }]}>{clubName} · {pos}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: tk.text }]}>£{price.toFixed(1)}m</Text>
        <Text style={[styles.meta, { color: tk.faint }]}>{ownership.toFixed(1)}% owned</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  name: { fontFamily: 'Archivo_900Black', fontSize: 26, letterSpacing: -0.78, marginTop: 12 },
  club: { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  meta: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
});
