import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  inner: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
  },
  gwTitle: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 26,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#fff',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 16,
    marginBottom: 16,
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
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  statValue: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 23,
    letterSpacing: -0.4,
    color: '#fff',
    marginTop: 5,
  },
});
