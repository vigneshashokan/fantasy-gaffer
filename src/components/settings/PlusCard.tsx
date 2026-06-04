import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

interface PlusCardProps {
  gradFrom: string;
  gradTo: string;
}

export function PlusCard({ gradFrom, gradTo }: PlusCardProps) {
  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <View style={styles.titleRow}>
          <Text style={styles.brand}>FPL Gaffer</Text>
          <Text style={styles.plus}>+</Text>
        </View>
        <Text style={styles.copy}>
          Subscribe for an ad-free experience and exclusive benefits
        </Text>
        <Pressable style={({ pressed }) => [
          styles.cta,
          pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
        ]}>
          <LinearGradient
            colors={['#FFE25A', '#F5B400']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <StarIcon />
          <Text style={styles.ctaText}>Go Premium</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StarIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"
        fill="#3A2A00"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  inner: {
    padding: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  brand: {
    fontFamily: 'Archivo_900Black',
    fontSize: 20,
    letterSpacing: -0.2,
    color: '#fff',
  },
  plus: {
    fontFamily: 'Archivo_900Black',
    fontSize: 20,
    color: '#FFD600',
  },
  copy: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 6,
    lineHeight: 19,
    maxWidth: 250,
  },
  cta: {
    marginTop: 14,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    shadowColor: '#F5B400',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ctaText: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 14.5,
    color: '#3A2A00',
  },
});
