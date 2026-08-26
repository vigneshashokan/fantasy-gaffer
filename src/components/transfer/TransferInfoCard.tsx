import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CornerGlow } from '@/components/ui/CornerGlow';
import { HERO_ON_DARK } from '@/constants/apexTokens';

interface TransferInfoCardProps {
  nextGw: number;
  squadValue: number;
  freeTransfers: number;
  inBank: number;
  gradFrom: string;
  gradTo: string;
}

export function TransferInfoCard({
  nextGw,
  squadValue,
  freeTransfers,
  inBank,
  gradFrom,
  gradTo,
}: TransferInfoCardProps) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Fainter than the points card's 0.2 — the mock's own number. */}
      <CornerGlow color={HERO_ON_DARK.glowPlayed} opacity={0.16} />

      <View style={styles.inner}>
        <Text style={styles.gwTitle}>Gameweek {nextGw}</Text>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.label}>Free Transfers</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {freeTransfers}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.label}>In the Bank</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              £{inBank.toFixed(1)}m
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.label}>Squad Value</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              £{squadValue.toFixed(1)}m
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  inner: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  gwTitle: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 21,
    color: '#fff',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.13)',
    marginTop: 12,
    marginBottom: 14,
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
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 9.5,
    letterSpacing: 0.67,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  statValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 21,
    color: '#fff',
    marginTop: 4,
  },
});
