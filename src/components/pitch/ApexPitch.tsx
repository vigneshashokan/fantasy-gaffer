import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ApexPitchMarks } from './ApexPitchMarks';
import { AvatarDisc } from '@/components/ui/AvatarDisc';
import { PointPill } from '@/components/ui/PointPill';
import { CaptBadge } from '@/components/ui/CaptBadge';
import {
  SubPill,
  SubInPill,
  BallBadge,
  CardIcons,
} from '@/components/ui/PitchBadges';
import { PitchPlayer } from '@/constants/data';

interface ApexPitchProps {
  rows: PitchPlayer[][];
  pitchStyle?: 'realistic' | 'flat';
  upcoming?: boolean;
}

export function ApexPitch({ rows, pitchStyle = 'realistic', upcoming = false }: ApexPitchProps) {
  const grassColor = pitchStyle === 'flat' ? '#1FA257' : '#1FA65B';

  return (
    <View style={[styles.container, { backgroundColor: grassColor }]}>
      <ApexPitchMarks />
      <View style={styles.rows}>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((p) => (
              <ApexPitchPlayerCard key={p.name} p={p} upcoming={upcoming} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function ApexPitchPlayerCard({ p, upcoming }: { p: PitchPlayer; upcoming: boolean }) {
  return (
    <View style={styles.playerContainer}>
      <View style={styles.avatarWrapper}>
        <AvatarDisc size={46} player={p} />
        {p.capt && <CaptBadge />}
        {!upcoming && p.cards && p.cards.length > 0 && <CardIcons cards={p.cards} />}
        {!upcoming && p.ball && <BallBadge />}
        {!upcoming && p.sub != null && <SubPill min={p.sub} />}
        {!upcoming && p.subIn != null && <SubInPill min={p.subIn} />}
      </View>
      <PointPill pts={upcoming ? undefined : p.pts} name={p.name} upcoming={upcoming} />
    </View>
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
    width: 90,
  },
  avatarWrapper: {
    position: 'relative',
    width: 54,
    height: 54,
  },
});
