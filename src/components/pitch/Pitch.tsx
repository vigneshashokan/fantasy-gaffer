import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { PitchMarks } from './PitchMarks';
import { PlayerToken } from '@/components/ui/PlayerToken';
import type { Player } from '@/types/fpl';

interface PitchProps {
  rows: Player[][];
  onPlayerPress?: (pl: Player) => void;
  style?: ViewStyle;
  pitchStyle?: 'realistic' | 'flat';
  kitSize?: number;
  showStat?: 'gw' | 'price';
}

export function Pitch({
  rows,
  onPlayerPress,
  style,
  pitchStyle = 'realistic',
  kitSize = 46,
  showStat = 'gw',
}: PitchProps) {
  // Stripe pattern approximated with solid base colour — RN doesn't support repeating gradients
  const grassColor = pitchStyle === 'realistic' ? '#138B47' : '#129A4C';

  return (
    <View style={[styles.container, { backgroundColor: grassColor }, style]}>
      <PitchMarks opacity={pitchStyle === 'realistic' ? 0.55 : 0.22} />
      <View style={styles.rows}>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((pl) => (
              <PlayerToken
                key={pl.id}
                pl={pl}
                kitSize={kitSize}
                showStat={showStat}
                onPress={onPlayerPress ? () => onPlayerPress(pl) : undefined}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    paddingVertical: 16,
  },
  rows: {
    position: 'relative',
    flexDirection: 'column',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
});
