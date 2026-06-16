import React, { useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  LayoutChangeEvent,
} from 'react-native';
import { ApexPitchMarks } from './ApexPitchMarks';
import { AvatarDisc } from '@/components/ui/AvatarDisc';
import { PointPill } from '@/components/ui/PointPill';
import { CaptBadge, ViceBadge } from '@/components/ui/CaptBadge';
import {
  SubPill,
  SubInPill,
  CardIcons,
} from '@/components/ui/PitchBadges';
import type { PitchPlayer } from '@/types/fpl';

interface ApexPitchProps {
  rows: PitchPlayer[][];
  pitchStyle?: 'realistic' | 'flat';
  upcoming?: boolean;
  onPlayerPress?: (p: PitchPlayer) => void;
}

// FPL formations can stack up to 5 outfielders in a row (e.g. 5 MID in 3-5-2).
// Sizing the slot for the worst case keeps jerseys consistent across all rows
// regardless of formation, and prevents wider rows from clipping off-screen.
const MAX_ROW = 5;
// Page paddingHorizontal (16×2 in team.tsx) + pitch paddingHorizontal (6×2).
const SIDE_CHROME = 32 + 12;
// Keep the floor low enough that a full 5-wide row still fits the narrowest
// supported screen (~320pt → (320-44)/5 ≈ 55), so jerseys scale down with the
// screen instead of overflowing it.
const SLOT_MIN = 48;
const SLOT_MAX = 90;
// Upper bound for a name pill on a sparse row (e.g. 2 forwards) so a long
// name can show in full without the pill growing unboundedly.
const PILL_MAX = 120;
const AVATAR_RATIO = 0.51;
const WRAPPER_RATIO = 0.6;

export function ApexPitch({
  rows,
  pitchStyle = 'realistic',
  upcoming = false,
  onPlayerPress,
}: ApexPitchProps) {
  const { width: screenW } = useWindowDimensions();
  const [pitch, setPitch] = useState({ w: 0, h: 0 });
  const grassColor = pitchStyle === 'flat' ? '#1FA257' : '#1FA65B';
  const slotW = Math.min(SLOT_MAX, Math.max(SLOT_MIN, (screenW - SIDE_CHROME) / MAX_ROW));
  const avatarSize = Math.round(slotW * AVATAR_RATIO);
  const wrapperSize = Math.round(slotW * WRAPPER_RATIO);

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
          // Pills size to the room available in THIS row: a 2-player row gets
          // wide pills (full names), a 5-player row gets tighter ones.
          const pillMaxW = Math.min(PILL_MAX, (screenW - SIDE_CHROME) / Math.max(1, row.length) - 6);
          return (
            <View key={i} style={styles.row}>
              {row.map((p) => (
                <ApexPitchPlayerCard
                  key={p.name}
                  p={p}
                  upcoming={upcoming}
                  slotW={slotW}
                  avatarSize={avatarSize}
                  wrapperSize={wrapperSize}
                  pillMaxW={pillMaxW}
                  onPress={onPlayerPress}
                />
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface PlayerCardProps {
  p: PitchPlayer;
  upcoming: boolean;
  slotW: number;
  avatarSize: number;
  wrapperSize: number;
  pillMaxW: number;
  onPress?: (p: PitchPlayer) => void;
}

function ApexPitchPlayerCard({
  p,
  upcoming,
  slotW,
  avatarSize,
  wrapperSize,
  pillMaxW,
  onPress,
}: PlayerCardProps) {
  const body = (
    <>
      <View style={[styles.avatarWrapper, { width: wrapperSize, height: wrapperSize }]}>
        <AvatarDisc size={avatarSize} player={p} />
        {p.capt && <CaptBadge />}
        {p.vice && <ViceBadge />}
        {!upcoming && p.cards && p.cards.length > 0 && <CardIcons cards={p.cards} />}
        {!upcoming && p.sub != null && <SubPill min={p.sub} />}
        {!upcoming && p.subIn != null && <SubInPill min={p.subIn} />}
      </View>
      <PointPill
        pts={upcoming ? undefined : p.pts}
        name={p.name}
        upcoming={upcoming}
        maxWidth={pillMaxW}
      />
    </>
  );

  if (!onPress) {
    return <View style={[styles.playerContainer, { width: slotW }]}>{body}</View>;
  }
  return (
    <Pressable
      style={({ pressed }) => [
        styles.playerContainer,
        { width: slotW },
        pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
      ]}
      onPress={() => onPress(p)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    paddingTop: 22,
    paddingBottom: 26,
    paddingHorizontal: 6,
  },
  rows: {
    position: 'relative',
    flexDirection: 'column',
    gap: 18,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  playerContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 7,
  },
  avatarWrapper: {
    position: 'relative',
  },
});
