import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ApexTokens } from '@/constants/apexTokens';

interface HeroCardProps {
  tk: ApexTokens;
  totalPoints: number;
  gwPts: number;
  avgPoints: number;
  highestPoints: number;
  gwInProgress?: boolean;
  gradFrom: string;
  gradTo: string;
}

export function HeroCard({
  tk,
  totalPoints,
  gwPts,
  avgPoints,
  highestPoints,
  gwInProgress,
  gradFrom,
  gradTo,
}: HeroCardProps) {
  const showStat = (val: number) => (gwInProgress && val === 0 ? '—' : val);

  // GW points relative to the gameweek average. Only meaningful once the
  // gameweek has finished (and an average exists).
  const diff = gwPts - avgPoints;
  const up = diff >= 0;
  const showVsAvg = !gwInProgress && avgPoints > 0;
  const vsAvgText = `${up ? '↑' : '↓'} ${diff > 0 ? '+' : ''}${diff} vs avg`;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <View style={styles.gwBlock}>
          <Text style={styles.gwBig}>{gwPts}</Text>
          <Text style={styles.label}>GW PTS</Text>
          {showVsAvg && (
            <View
              style={[
                styles.vsAvgPill,
                { backgroundColor: up ? tk.greenSoft : 'rgba(255,255,255,0.12)' },
              ]}
            >
              <Text
                style={[
                  styles.vsAvgText,
                  { color: up ? tk.green : 'rgba(255,255,255,0.7)' },
                ]}
              >
                {vsAvgText}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{showStat(avgPoints)}</Text>
            <Text style={styles.label}>Avg Points</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{showStat(highestPoints)}</Text>
            <Text style={styles.label}>Highest</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{totalPoints.toLocaleString()}</Text>
            <Text style={styles.label}>Total Points</Text>
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
  gwBlock: {
    alignItems: 'center',
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
    lineHeight: 60,
    letterSpacing: -1.74,
    color: '#fff',
  },
  vsAvgPill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  vsAvgText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
    letterSpacing: -0.13,
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
  },
});
