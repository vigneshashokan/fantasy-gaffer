import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PaletteKey } from '@/constants/theme';

const OPTIONS: { key: PaletteKey; label: string; grad: [string, string] }[] = [
  { key: 'classic',  label: 'Classic',  grad: ['#37003C', '#6A0060'] },
  { key: 'electric', label: 'Fantasy',  grad: ['#1B0A3E', '#4A1B8C'] },
  { key: 'pitch',    label: 'Pitch',    grad: ['#06371F', '#0B6B38'] },
];

interface ThemeToggleProps {
  palette: PaletteKey;
  onSetPalette: (k: PaletteKey) => void;
}

export function ThemeToggle({ palette, onSetPalette }: ThemeToggleProps) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((o) => {
        const on = palette === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onSetPalette(o.key)}
            style={[
              styles.btn,
              {
                borderColor: on ? '#fff' : 'transparent',
                opacity: on ? 1 : 0.5,
              },
            ]}
          >
            <LinearGradient
              colors={o.grad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.label}>{o.label}</Text>
            {on && <View style={styles.indicator} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 11,
    overflow: 'hidden',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 14,
    color: '#fff',
    letterSpacing: -0.14,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  indicator: {
    position: 'absolute',
    bottom: 7,
    width: 16,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
});
