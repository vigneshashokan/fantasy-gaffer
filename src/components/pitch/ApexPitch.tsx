import React, { useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  LayoutChangeEvent,
} from 'react-native';
import { GUTTER } from '@/constants/theme';
import { ApexPitchMarks } from './ApexPitchMarks';
import { AvatarDisc } from '@/components/ui/AvatarDisc';
import { PointPill } from '@/components/ui/PointPill';
import {
  SubPill,
  SubInPill,
  GoalsBadge,
  AssistsBadge,
  CardIcons,
  CaptViceBadge,
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
// The pitch's own horizontal padding. A pill on an outer slot may hang into it
// without meeting the container's `overflow: hidden`.
const PITCH_PAD = 6;
// How far the outer slots are held off the pitch edge. `space-around` fixes the
// first slot's centre at half a share whatever the slot width, so shrinking the
// slot does NOT move it inward — only padding the row does, and the outer pills
// need that room to hang into or they meet `overflow: hidden` mid-name.
const ROW_INSET = 16;
// Page gutter, the pitch's padding and that inset. Slots are sized off this, so
// it must account for every one of them or a full row runs past the pitch.
const SIDE_CHROME = GUTTER * 2 + PITCH_PAD * 2 + ROW_INSET * 2;
// Keep the floor low enough that a full 5-wide row still fits the narrowest
// supported screen (~320pt → (320-44)/5 ≈ 55), so jerseys scale down with the
// screen instead of overflowing it.
const SLOT_MIN = 48;
const SLOT_MAX = 90;
// Upper bound for a name pill. Pills size to their content (the name) up to
// this cap, so a longer name gets a wider pill; only an extreme name truncates.
const PILL_MAX = 150;
const AVATAR_RATIO = 0.51;
const WRAPPER_RATIO = 0.6;
// A row this wide leaves no gap between slots, so a pill that outgrows its slot
// has nowhere to hang. These rows split onto two planes instead — 1st/3rd/5th
// high, 2nd/4th low — which is what buys the width back.
const STAGGER_FROM = 5;
// Enough to clear a pill (14pt disc plus its padding and border).
const STAGGER = 22;

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
          const stagger = row.length >= STAGGER_FROM;
          // `space-around` puts the slot centres one share apart, so a pill up
          // to a share wide grows past its own slot without touching the next
          // one. A staggered row's neighbours are on the other plane, so only
          // the pitch edge binds and the pill may use the padding too.
          const share = (screenW - SIDE_CHROME) / row.length;
          // How far a pill may outgrow its slot, which differs by slot: the
          // outer two meet the pitch edge (and may hang into the row inset and
          // the pitch padding), the rest meet the pill two slots along. This is
          // the width the NAME is measured against — see `pillRow` below.
          const cap = (j: number) =>
            Math.min(
              PILL_MAX,
              j === 0 || j === row.length - 1
                ? share + 2 * (ROW_INSET + PITCH_PAD)
                : share * 2,
            );
          return (
            <View key={i} testID="pitch-row" style={styles.row}>
              {row.map((p, j) => (
                <ApexPitchPlayerCard
                  key={p.id}
                  p={p}
                  upcoming={upcoming}
                  slotW={slotW}
                  avatarSize={avatarSize}
                  wrapperSize={wrapperSize}
                  pillMaxW={cap(j)}
                  dropped={stagger && j % 2 === 1}
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
  /** Sits on the lower of the two planes of a staggered row. */
  dropped: boolean;
  onPress?: (p: PitchPlayer) => void;
}

function ApexPitchPlayerCard({
  p,
  upcoming,
  slotW,
  avatarSize,
  wrapperSize,
  pillMaxW,
  dropped,
  onPress,
}: PlayerCardProps) {
  const body = (
    <>
      <View style={[styles.avatarWrapper, { width: wrapperSize, height: wrapperSize }]}>
        <AvatarDisc size={avatarSize} player={p} />
        {!upcoming && p.cards && p.cards.length > 0 && <CardIcons cards={p.cards} />}
        {!upcoming && p.goals != null && p.goals > 0 && <GoalsBadge count={p.goals} />}
        {!upcoming && p.assists != null && p.assists > 0 && <AssistsBadge count={p.assists} />}
        {!upcoming && p.sub != null && <SubPill min={p.sub} />}
        {!upcoming && p.subIn != null && <SubInPill min={p.subIn} />}
      </View>
      {/* A DEFINITE width, and that is the whole point of it. The card is
          fixed to its slot so the row cannot overflow, and a name measures
          itself against the nearest definite width above it — which was that
          slot, so every name was truncating to a jersey's width. This box is
          the room the pill actually has, so the name is measured against that
          and simply overhangs the card, which is what the staggered planes and
          the row inset exist to make safe. */}
      <View testID="pill-row" style={[styles.pillRow, { width: pillMaxW }]}>
        <CaptViceBadge capt={p.capt} vice={p.vice} />
        <PointPill
          pts={upcoming ? undefined : p.pts}
          name={p.name}
          upcoming={upcoming}
          maxWidth={pillMaxW}
          bonus={p.bonus}
        />
      </View>
    </>
  );

  // A FIXED width, so the row can never sum past the pitch — this was
  // `minWidth`, which let a long name grow the card, and five of those pushed
  // the last player clean off the right edge. The pill is still free to be
  // wider than the card: it just overhangs, and `pillMaxW` bounds how far.
  const slot = { width: slotW, marginTop: dropped ? STAGGER : 0 };
  if (!onPress) {
    return <View testID="pitch-slot" style={[styles.playerContainer, slot]}>{body}</View>;
  }
  return (
    <Pressable
      testID="pitch-slot"
      style={({ pressed }) => [
        styles.playerContainer,
        slot,
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
    paddingHorizontal: PITCH_PAD,
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
    paddingHorizontal: ROW_INSET,
  },
  playerContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 7,
  },
  avatarWrapper: {
    position: 'relative',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
