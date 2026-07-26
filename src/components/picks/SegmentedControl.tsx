import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';

interface SegmentedControlProps {
  options: string[];
  value: number;
  onChange: (i: number) => void;
  tk: ApexTokens;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  tk,
}: SegmentedControlProps) {
  return (
    <View accessibilityRole="tablist" style={[styles.track, { backgroundColor: tk.track }]}>
      {options.map((opt, i) => {
        const on = i === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(i)}
            // Named by its own text, per the text-button convention in
            // docs/a11y.md — only the role and selected state were missing.
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[
              styles.tab,
              on && { backgroundColor: tk.activeFill },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: on ? '#fff' : tk.variant },
              ]}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
    letterSpacing: 0.13,
  },
});
