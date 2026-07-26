import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BallIcon, BootIcon } from './statIcons';
import { ON_PITCH } from '@/constants/apexTokens';

const CARD_COLORS = { yellow: '#FFCD00', red: '#FF3B3B' };

export function SubPill({ min }: { min: number }) {
  return (
    <View style={[styles.subPill, { backgroundColor: ON_PITCH.subOff }]}>
      <Text style={styles.subText}>{`←${min}'`}</Text>
    </View>
  );
}

export function SubInPill({ min }: { min: number }) {
  return (
    <View style={[styles.subPill, { backgroundColor: ON_PITCH.subIn }]}>
      <Text style={styles.subText}>{`${min}'→`}</Text>
    </View>
  );
}

// Standalone captain / vice disc that sits just left of the points pill (not
// inside it). White fill + purple letter — the inverse of the points disc — so
// it reads as distinct from the score; vice is outlined to stay secondary.
// Captain wins if both are set; renders nothing for a regular player.
export function CaptViceBadge({ capt, vice }: { capt?: boolean; vice?: boolean }) {
  if (!capt && !vice) return null;
  return (
    <View style={[styles.cvBadge, !capt && styles.cvBadgeVice]}>
      <Text style={styles.cvText}>{capt ? 'C' : 'V'}</Text>
    </View>
  );
}

const STACK_CAP = 4;

export function GoalsBadge({ count }: { count: number }) {
  return <StatStack count={count} side="right" label="goals" testID="goals-badge" Icon={BallIcon} />;
}

export function AssistsBadge({ count }: { count: number }) {
  return <StatStack count={count} side="left" label="assists" testID="assists-badge" Icon={BootIcon} />;
}

function StatStack({
  count,
  side,
  label,
  testID,
  Icon,
}: {
  count: number;
  side: 'left' | 'right';
  label: string;
  testID: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
}) {
  if (count < 1) return null;
  const shown = Math.min(count, STACK_CAP);
  return (
    <View
      testID={testID}
      accessibilityLabel={`${count} ${label}`}
      style={[styles.statStack, side === 'right' ? styles.statRight : styles.statLeft]}
    >
      {Array.from({ length: shown }).map((_, i) => (
        <View key={i} style={[styles.icon, i !== 0 && styles.stackOverlap]}>
          <Icon size={15} />
        </View>
      ))}
      {count > STACK_CAP && <Text style={styles.stackOverflow}>{`·${count}`}</Text>}
    </View>
  );
}

export function CardIcons({ cards }: { cards: Array<'yellow' | 'red'> }) {
  // Last card (red) anchors flush to the top-right corner with the highest
  // zIndex; earlier cards (yellow) peek out leftward from behind it.
  return (
    <View style={styles.cards}>
      {cards.map((c, i) => (
        <View
          key={i}
          testID={`card-${c}`}
          style={[
            styles.card,
            { backgroundColor: CARD_COLORS[c], right: (cards.length - 1 - i) * 7, zIndex: i },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  subPill: {
    position: 'absolute',
    top: -10,
    left: -14,
    height: 16,
    borderRadius: 999,
    // Borders are inside the box in RN, so the padding absorbs the ring.
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: ON_PITCH.ring,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  subText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 11,
    color: ON_PITCH.ink,
    // No explicit lineHeight + trimmed font padding so the glyphs sit centered
    // in the pill instead of riding high (a fixed lineHeight left a gap below).
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  cvBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cvBadgeVice: { borderWidth: 1, borderColor: '#C4B5FD' },
  cvText: { fontFamily: 'Archivo_800ExtraBold', fontSize: 10, color: '#7B09E5' },
  // Bare positioning container — no dark badge behind the icons.
  statStack: {
    position: 'absolute',
    bottom: -2,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 3,
  },
  statRight: { right: -4 },
  statLeft: { left: -4 },
  stackOverlap: { marginLeft: -9 },
  // Soft shadow so the bare icons stay legible against the jersey.
  icon: {
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  stackOverflow: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 9,
    color: '#fff',
    marginLeft: 1,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 2,
  },
  cards: {
    position: 'absolute',
    top: -7,
    right: -6,
    width: 24,
    height: 20,
    zIndex: 5,
  },
  card: {
    position: 'absolute',
    top: 0,
    width: 13,
    height: 17,
    borderRadius: 2.5,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.15)',
    transform: [{ rotate: '-10deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
