import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { ClubCode, Position } from '@/types/fpl';
import { Kit } from '@/components/ui/Kit';
import { GUTTER } from '@/constants/theme';

interface PlayerHeroProps {
  name: string;
  club: ClubCode;
  clubName: string;
  pos: Position;
  price: number;
  ownership: number;
  tk: ApexTokens;
}

/**
 * The v2 mock's identity card: kit on the left, name over club/position with
 * price + ownership beneath. (The mock also puts a captain disc next to the
 * name — this screen has no squad context, so there is nothing to draw it from.)
 */
export function PlayerHero({ name, club, clubName, pos, price, ownership, tk }: PlayerHeroProps) {
  return (
    <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      {/* Kit draws its image at 1.2× the size it is given — 48 lands on the
          mock's 58pt jersey. */}
      <Kit club={club} size={48} playerName={name} />
      <View style={styles.body}>
        <Text style={[styles.name, { color: tk.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.club, { color: tk.variant }]} numberOfLines={1}>
          {clubName} · {pos}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.price, { color: tk.text }]}>£{price.toFixed(1)}m</Text>
          <Text style={[styles.owned, { color: tk.faint }]}>{ownership.toFixed(1)}% owned</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: GUTTER,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  body: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Archivo_800ExtraBold', fontSize: 21, letterSpacing: -0.42 },
  club: { fontFamily: 'Archivo_500Medium', fontSize: 12.5, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  price: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
  owned: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12.5 },
});
