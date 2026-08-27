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
import { GUTTER } from '@/constants/theme';
import type { TransferPitchPlayer } from '@/types/fpl';

interface TransferPitchProps {
  rows: TransferPitchPlayer[][];
  pitchStyle?: 'realistic' | 'flat';
  onPlayerPress?: (p: TransferPitchPlayer) => void;
}

// Slot sized for FPL's widest row (5 MID or 5 DEF).
const MAX_ROW = 5;
// transfer.tsx's `pitchWrap` pays GUTTER each side (this said 16 and it has
// been 8 for as long as the file has existed), the pitch pays its own padding,
// and the row is held off the pitch edge so the outer pills have somewhere to
// hang. Slots are sized off all three or a full row runs past the pitch.
const PITCH_PAD = 2;
const ROW_INSET = 16;
const SIDE_CHROME = (GUTTER + PITCH_PAD + ROW_INSET) * 2;
// Low floor so a full 5-wide row fits the narrowest screen and jerseys scale
// down instead of bleeding off the edge.
const SLOT_MIN = 50;
const SLOT_MAX = 72;
const AVATAR_RATIO = 0.64;
const PILL_MAX = 120;
const STAGGER_FROM = 5;
// The gap between the two planes of a staggered row, matching ApexPitch. The
// whole card drops, price pill included — dropping the name alone left the
// jerseys in one line but the names looking mis-set, and it gave the price pill
// nothing to overhang into, so a six-character price wrapped onto two lines and
// pushed that one card's jersey out of the row.
const STAGGER = 30;

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
          const stagger = row.length >= STAGGER_FROM;
          // `space-around` puts the slot centres one share apart. On one plane
          // a pill stops at its neighbour; a staggered row's neighbours are on
          // the other plane, so its pills meet the pill two slots along — or,
          // on the outer slots, the pitch edge they may hang towards.
          const share =
            ((screenW - SIDE_CHROME) * (isKeeperRow ? 0.5 : 1)) / Math.max(1, row.length);
          const cap = (j: number) =>
            Math.min(
              PILL_MAX,
              !stagger
                ? share
                : j === 0 || j === row.length - 1
                  ? share + 2 * (ROW_INSET + PITCH_PAD)
                  : share * 2,
            );
          return (
            <View key={i} testID="transfer-row" style={styles.row}>
              {isKeeperRow ? (
                <View style={styles.keeperBand}>
                  {row.map((p, j) => (
                    <TransferPlayer
                      key={p.id}
                      p={p}
                      onPress={onPlayerPress}
                      slotW={slotW}
                      avatarSize={avatarSize}
                      pillMaxW={cap(j)}
                      dropped={stagger && j % 2 === 1}
                    />
                  ))}
                </View>
              ) : (
                row.map((p, j) => (
                  <TransferPlayer
                    key={p.id}
                    p={p}
                    onPress={onPlayerPress}
                    slotW={slotW}
                    avatarSize={avatarSize}
                    pillMaxW={cap(j)}
                    dropped={stagger && j % 2 === 1}
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
  pillMaxW: number;
  /** Sits on the lower of the two planes of a staggered row. */
  dropped: boolean;
}

function TransferPlayer({
  p,
  onPress,
  slotW,
  avatarSize,
  pillMaxW,
  dropped,
}: TransferPlayerProps) {
  return (
    <Pressable
      testID="transfer-slot"
      style={({ pressed }) => [
        styles.player,
        // A FIXED width so the row can never sum past the pitch; the pills are
        // free to be wider and overhang it.
        { width: slotW, marginTop: dropped ? STAGGER : 0 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
      ]}
      onPress={onPress ? () => onPress(p) : undefined}
    >
      {/* Both of these carry a DEFINITE width, and that is the whole point of
          them. A text measures itself against the nearest definite width above
          it, which was the fixed slot — so a name truncated to a jersey's width
          and `£15.5m` wrapped onto two lines, taking that card's jersey out of
          line with the rest of the row. These boxes are the room the pills
          actually have; the pills simply overhang the card. */}
      <View testID="transfer-price-row" style={[styles.pillRow, { width: pillMaxW }]}>
        <View style={styles.pricePill}>
          <Text style={styles.priceText}>£{p.p.toFixed(1)}m</Text>
        </View>
      </View>
      <AvatarDisc size={avatarSize} player={p} />
      <View testID="transfer-pill-row" style={[styles.pillRow, { width: pillMaxW }]}>
        <PointPill name={p.name} upcoming maxWidth={pillMaxW} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    // Tight at both ends, like ApexPitch: the forwards belong at the top of the
    // pitch and the keepers on their own goal line, so the room goes into the
    // gaps between the rows instead.
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: PITCH_PAD,
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
    paddingHorizontal: ROW_INSET,
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
  pillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
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
