import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

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

export function BallBadge() {
  return (
    <View style={styles.ballWrap}>
      <Svg width={14} height={14} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={10.5} fill="#fff" />
        <Path d="M12 6.6l3.4 2.5-1.3 4h-4.2l-1.3-4z" fill="#0B1224" />
        <Path
          d="M12 3.6v3M5.8 8.4l2.6 1.1M18.2 8.4l-2.6 1.1M9 16.6l1.1-3.5M15 16.6l-1.1-3.5"
          stroke="#0B1224"
          strokeWidth={1.15}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

export function CardIcons({ cards }: { cards: Array<'yellow' | 'red'> }) {
  return (
    <View style={styles.cards}>
      {cards.map((c, i) => (
        <View
          key={i}
          style={[
            styles.card,
            {
              backgroundColor: CARD_COLORS[c],
              marginLeft: i === 0 ? 0 : -7,
              transform: [{ rotate: '-12deg' }],
            },
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
  ballWrap: {
    position: 'absolute',
    right: -4,
    bottom: 12,
    width: 21,
    height: 21,
    borderRadius: 10.5,
    backgroundColor: '#0B1224',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    zIndex: 3,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  cards: {
    position: 'absolute',
    top: -7,
    left: -9,
    flexDirection: 'row',
    zIndex: 3,
  },
  card: {
    width: 13,
    height: 17,
    borderRadius: 2.5,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
