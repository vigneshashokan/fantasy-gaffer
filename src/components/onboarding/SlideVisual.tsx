import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { POS_COLOR } from '@/components/ui/PosTag';

type Variant = 'picks' | 'team' | 'strategy';

interface SlideVisualProps {
  variant: Variant;
}

const FRAME_W = 199;
const FRAME_H = 433;

export function SlideVisual({ variant }: SlideVisualProps) {
  const rotate = variant === 'team' ? '2.5deg' : '-2.5deg';
  return (
    <View
      style={[styles.shadow, { transform: [{ rotate }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.frame}>
        <View style={styles.notch} />
        {variant === 'picks' && <PicksContent />}
        {variant === 'team' && <TeamContent />}
        {variant === 'strategy' && <StrategyContent />}
      </View>
    </View>
  );
}

function PicksContent() {
  const rows: Array<{ name: string; pos: 'GKP' | 'DEF' | 'MID' | 'FWD'; pts: number }> = [
    { name: 'Haaland',     pos: 'FWD', pts: 16 },
    { name: 'Doku',        pos: 'MID', pts: 13 },
    { name: 'Saka',        pos: 'MID', pts: 11 },
    { name: 'Watkins',     pos: 'FWD', pts: 10 },
    { name: 'B.Fernandes', pos: 'MID', pts: 9 },
  ];
  return (
    <View style={styles.inner}>
      <Text style={styles.heading}>Top Picks</Text>
      <View style={{ gap: 6, marginTop: 10 }}>
        {rows.map((r, i) => {
          const c = POS_COLOR[r.pos];
          return (
            <View key={i} style={styles.row}>
              <View style={[styles.pos, { backgroundColor: c.bg }]}>
                <Text style={[styles.posText, { color: c.fg }]}>{r.pos}</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
              <Text style={styles.pts}>{r.pts}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TeamContent() {
  return (
    <View style={styles.inner}>
      <Text style={styles.heading}>My Team</Text>
      <View style={styles.pitch}>
        {/* fake pitch lines */}
        <View style={styles.pitchOutline} />
        <View style={styles.pitchHalfLine} />
        <View style={styles.pitchCircle} />
        {/* 3 rows of dot players */}
        <View style={[styles.pitchRow, { top: 18 }]}>
          <View style={styles.kit} />
        </View>
        <View style={[styles.pitchRow, { top: 58, justifyContent: 'space-around' }]}>
          <View style={styles.kit} />
          <View style={styles.kit} />
          <View style={styles.kit} />
          <View style={styles.kit} />
        </View>
        <View style={[styles.pitchRow, { top: 118, justifyContent: 'space-around' }]}>
          <View style={styles.kit} />
          <View style={styles.kit} />
          <View style={styles.kit} />
        </View>
        <View style={[styles.pitchRow, { top: 168, justifyContent: 'space-around' }]}>
          <View style={styles.kit} />
          <View style={styles.kit} />
          <View style={styles.kit} />
        </View>
      </View>
    </View>
  );
}

function StrategyContent() {
  const chips = ['Wildcard', 'Free Hit', 'Bench Boost', 'Triple Captain'];
  return (
    <View style={styles.inner}>
      <Text style={styles.heading}>Strategy</Text>
      <View style={{ gap: 8, marginTop: 10 }}>
        {chips.map((c, i) => (
          <View key={i} style={styles.chipTile}>
            <View style={styles.chipBolt}>
              <Icon name="fire" color="#FFC53D" size={14} />
            </View>
            <Text style={styles.chipName}>{c}</Text>
            <View style={styles.chipStatus}>
              <Text style={styles.chipStatusText}>Available</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    width: FRAME_W,
    height: FRAME_H,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 24 },
    elevation: 18,
  },
  frame: {
    width: FRAME_W,
    height: FRAME_H,
    borderRadius: 32,
    backgroundColor: '#0c0710',
    borderWidth: 4,
    borderColor: '#1a0e26',
    overflow: 'hidden',
  },
  notch: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -36,
    width: 72,
    height: 18,
    borderRadius: 12,
    backgroundColor: '#0a0510',
    zIndex: 2,
  },
  inner: {
    flex: 1,
    paddingTop: 36,
    paddingHorizontal: 14,
    paddingBottom: 14,
    backgroundColor: '#23042B',
  },
  heading: {
    fontFamily: 'Archivo_900Black',
    fontSize: 17,
    color: '#fff',
    letterSpacing: -0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pos: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  posText: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 8,
    letterSpacing: 0.3,
  },
  name: {
    flex: 1,
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    color: '#fff',
  },
  pts: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 12,
    color: '#00FF87',
  },
  pitch: {
    marginTop: 10,
    height: 232,
    borderRadius: 12,
    backgroundColor: '#1B9A53',
    overflow: 'hidden',
    position: 'relative',
  },
  pitchOutline: {
    position: 'absolute',
    top: 4, left: 4, right: 4, bottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
  },
  pitchHalfLine: {
    position: 'absolute',
    top: '50%',
    left: 4,
    right: 4,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  pitchCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -16,
    marginLeft: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  pitchRow: {
    position: 'absolute',
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  kit: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#37003C',
  },
  chipTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#37003C',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  chipBolt: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipName: {
    flex: 1,
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 12,
    color: '#fff',
  },
  chipStatus: {
    backgroundColor: 'rgba(0,228,120,0.16)',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipStatusText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 8.5,
    color: '#00E478',
  },
});
