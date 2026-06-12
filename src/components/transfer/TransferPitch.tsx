import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { ApexPitchMarks } from '@/components/pitch/ApexPitchMarks';
import { AvatarDisc } from '@/components/ui/AvatarDisc';
import { PointPill } from '@/components/ui/PointPill';
import type { TransferPitchPlayer } from '@/types/fpl';

interface TransferPitchProps {
  rows: TransferPitchPlayer[][];
  pitchStyle?: 'realistic' | 'flat';
  onPlayerPress?: (p: TransferPitchPlayer) => void;
}

// Slot sized for FPL max row (5 MID); page paddingHorizontal (16×2 from
// transfer.tsx pitchWrap) + pitch paddingHorizontal (2×2) = 36.
const MAX_ROW = 5;
const SIDE_CHROME = 32 + 4;
const SLOT_MIN = 56;
const SLOT_MAX = 72;
const AVATAR_RATIO = 0.64;

export function TransferPitch({
  rows,
  pitchStyle = 'realistic',
  onPlayerPress,
}: TransferPitchProps) {
  const { width: screenW } = useWindowDimensions();
  const [pitch, setPitch] = useState({ w: 0, h: 0 });
  const grassColor = pitchStyle === 'flat' ? '#1FA257' : '#1FA65B';
  const slotW = Math.min(SLOT_MAX, Math.max(SLOT_MIN, (screenW - SIDE_CHROME) / MAX_ROW));
  const avatarSize = Math.round(slotW * AVATAR_RATIO);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== pitch.w || height !== pitch.h) setPitch({ w: width, h: height });
  };
  return (
    <View
      style={[styles.container, { backgroundColor: grassColor }]}
      onLayout={onLayout}
    >
      <ApexPitchMarks width={pitch.w} height={pitch.h} />
      <View style={styles.rows}>
        {rows.map((row, i) => {
          // GKP row sits inside a half-width band so the keeper is centred
          // between the goal posts.
          const isKeeperRow = row[0]?.pos === 'GKP';
          return (
            <View key={i} style={styles.row}>
              {isKeeperRow ? (
                <View style={styles.keeperBand}>
                  {row.map((p) => (
                    <TransferPlayer
                      key={p.name}
                      p={p}
                      onPress={onPlayerPress}
                      slotW={slotW}
                      avatarSize={avatarSize}
                    />
                  ))}
                </View>
              ) : (
                row.map((p) => (
                  <TransferPlayer
                    key={p.name}
                    p={p}
                    onPress={onPlayerPress}
                    slotW={slotW}
                    avatarSize={avatarSize}
                  />
                ))
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface TransferPlayerProps {
  p: TransferPitchPlayer;
  onPress?: (p: TransferPitchPlayer) => void;
  slotW: number;
  avatarSize: number;
}

function TransferPlayer({ p, onPress, slotW, avatarSize }: TransferPlayerProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.player,
        { width: slotW },
        pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
      ]}
      onPress={onPress ? () => onPress(p) : undefined}
    >
      <View style={styles.pricePill}>
        <Text style={styles.priceText}>£{p.p.toFixed(1)}m</Text>
      </View>
      <AvatarDisc size={avatarSize} player={p} />
      <PointPill name={p.name} upcoming maxWidth={slotW} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 2,
  },
  rows: {
    position: 'relative',
    flexDirection: 'column',
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  keeperBand: {
    width: '50%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  player: {
    alignItems: 'center',
    gap: 5,
  },
  pricePill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  priceText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 12,
    color: '#1A2236',
    letterSpacing: -0.24,
  },
});
