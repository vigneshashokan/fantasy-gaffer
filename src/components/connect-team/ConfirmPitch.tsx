// src/components/connect-team/ConfirmPitch.tsx
//
// Lightweight pitch + bench preview for the confirm view. Takes a Preview
// (no points/fixtures) and renders four position rows (FWD/MID/DEF/GKP)
// plus a bench strip. Captain disc ringed in gold; vice gets a "V" badge.
//
// Kept separate from <ApexPitch /> because confirm-time data is much
// sparser. Forcing the live pitch to handle empty fields would muddy it.

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import type { Preview, PreviewPlayer } from '@/api/teamPreview';
import type { ClubCode } from '@/types/fpl';
import { CLUB_COLORS } from '@/constants/clubColors';
import { jerseyForClub } from '@/constants/jerseys';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';

interface ConfirmPitchProps {
  preview: Preview;
}

// Partition starters into a 4-3-3 visual layout (rows: FWD, MID, DEF, GKP).
// PreviewPlayer doesn't carry position, but composePreview preserves FPL
// pick order — index 0 is the GK, last entries are FWDs. Reversing puts
// forwards in the top row. For partial squads, rows simply contain fewer
// players.
function rowsFromStarters(starters: PreviewPlayer[]): PreviewPlayer[][] {
  const reversed = [...starters].reverse();
  const SHAPE = [3, 4, 3, 1];
  const out: PreviewPlayer[][] = [];
  let i = 0;
  for (const size of SHAPE) {
    out.push(reversed.slice(i, i + size));
    i += size;
  }
  return out;
}

// `nameColor` is required rather than defaulted: the same disc renders on the
// dark pitch AND on the bench card, which is white in light mode — a
// hardcoded '#fff' made every bench name invisible there.
function PlayerDisc({ player, nameColor }: { player: PreviewPlayer; nameColor: string }) {
  const color = CLUB_COLORS[player.club] ?? { kit: '#666', kit2: '#fff', ink: '#fff' };
  const jersey = jerseyForClub(player.club as ClubCode);
  const captainRing = player.capt ? { borderWidth: 2, borderColor: '#FFD60A' } : null;

  return (
    <View style={styles.cell}>
      <View style={[styles.disc, { backgroundColor: color.kit }, captainRing]}>
        {jersey ? (
          <Image source={jersey} style={styles.jersey} resizeMode="contain" />
        ) : (
          <Text style={[styles.club, { color: color.ink }]}>{player.club}</Text>
        )}
      </View>
      <View style={styles.nameRow}>
        <Text style={[styles.name, { color: nameColor }]} numberOfLines={1}>{player.name}</Text>
        {player.vice ? <Text style={styles.viceBadge}>V</Text> : null}
      </View>
    </View>
  );
}

export function ConfirmPitch({ preview }: ConfirmPitchProps) {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);

  const rows = rowsFromStarters(preview.starters);

  return (
    <View>
      <View style={[styles.pitch, { backgroundColor: dark ? '#0d2316' : '#103222' }]}>
        {rows.map((row, idx) => (
          <View key={idx} style={styles.row}>
            {row.map((player, j) => (
              // The pitch is always dark green, so names stay white here.
              <PlayerDisc key={`${idx}-${j}`} player={player} nameColor="#fff" />
            ))}
          </View>
        ))}
      </View>
      <View style={[styles.bench, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
        <Text style={[styles.benchLabel, { color: tk.faint }]}>Bench</Text>
        <View style={styles.benchRow}>
          {preview.bench.map((player, i) => (
            <PlayerDisc key={`b-${i}`} player={player} nameColor={tk.text} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pitch: {
    borderRadius: 16,
    padding: 14,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  cell: {
    alignItems: 'center',
    gap: 4,
    minWidth: 60,
  },
  disc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  jersey: { width: 44, height: 44 },
  club: {
    fontFamily: 'Archivo_900Black',
    fontSize: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
  },
  viceBadge: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 9,
    color: '#0c0d12',
    backgroundColor: '#bbb',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  bench: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  benchLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  benchRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});
