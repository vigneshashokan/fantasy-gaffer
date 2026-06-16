import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BallIcon, BootIcon } from './statIcons';

const CARD_COLORS = { yellow: '#FFCD00', red: '#FF3B3B' };

export function SubPill({ min }: { min: number }) {
  return (
    <View style={[styles.subPill, { backgroundColor: '#FF3B5C' }]}>
      <Text style={styles.subText}>{`←${min}'`}</Text>
    </View>
  );
}

export function SubInPill({ min }: { min: number }) {
  return (
    <View style={[styles.subPill, { backgroundColor: '#16C172' }]}>
      <Text style={styles.subText}>{`${min}'→`}</Text>
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
        <View key={i} style={i === 0 ? undefined : styles.stackOverlap}>
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
    width: 40,
    height: 20,
    borderRadius: 999,
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
    color: '#fff',
    lineHeight: 13,
  },
  statStack: {
    position: 'absolute',
    bottom: -3,
    height: 21,
    borderRadius: 11,
    backgroundColor: '#0B1224',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 3,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  statRight: { right: -10 },
  statLeft: { left: -10 },
  stackOverlap: { marginLeft: -9 },
  stackOverflow: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 9,
    color: '#fff',
    marginLeft: 1,
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
