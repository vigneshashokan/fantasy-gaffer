import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface HeroCardProps {
  teamName: string;
  totalPoints: number;
  gwPts: number;
  avgPoints: number;
  highestPoints: number;
  gwInProgress?: boolean;
  gradFrom: string;
  gradTo: string;
}

export function HeroCard({
  teamName,
  totalPoints,
  gwPts,
  avgPoints,
  highestPoints,
  gwInProgress,
  gradFrom,
  gradTo,
}: HeroCardProps) {
  const showStat = (val: number) => (gwInProgress && val === 0 ? '—' : val);
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.teamName} numberOfLines={1}>{teamName}</Text>
            <Text style={styles.totalNum}>{totalPoints.toLocaleString()}</Text>
            <Text style={styles.label}>Total Points</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.label}>GW PTS</Text>
            <Text style={styles.gwBig}>{gwPts}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.label}>Avg Points</Text>
            <Text style={styles.statValue}>{showStat(avgPoints)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.label}>Highest Points</Text>
            <Text style={styles.statValue}>{showStat(highestPoints)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  inner: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  teamName: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 23,
    letterSpacing: -0.46,
    color: '#fff',
  },
  totalNum: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 19,
    color: '#fff',
    marginTop: 10,
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  gwBig: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 58,
    lineHeight: 56,
    letterSpacing: -1.74,
    color: '#fff',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  statValue: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    color: '#fff',
    marginTop: 4,
  },
});
