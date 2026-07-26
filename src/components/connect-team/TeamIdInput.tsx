// src/components/connect-team/TeamIdInput.tsx
//
// Numeric, max-8-digit input with thin-space formatting for readability
// (12 345 678). FPL team IDs are at most 8 digits today; 8 is the hard
// cap. Error message lives below the field; help link sits under the
// error slot so layout stays consistent.

import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';

const MAX_DIGITS = 8;

function formatWithSpaces(digits: string): string {
  if (!digits) return '';
  const groups: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) {
    groups.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return groups.join(' ');
}

interface TeamIdInputProps {
  value: string;
  onChange: (digits: string) => void;
  onHelpPress: () => void;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

export function TeamIdInput({
  value, onChange, onHelpPress, error, disabled, testID,
}: TeamIdInputProps) {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS);
    onChange(digits);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: tk.faint }]}>Team ID</Text>
      <TextInput
        testID={testID}
        value={formatWithSpaces(value)}
        onChangeText={handleChange}
        keyboardType="number-pad"
        editable={!disabled}
        placeholder="12 345 678"
        placeholderTextColor={tk.faint}
        style={[
          styles.input,
          { backgroundColor: tk.card, borderColor: error ? tk.danger : tk.cardBorder, color: tk.text },
        ]}
      />
      {error ? (
        <Text style={[styles.error, { color: tk.danger }]}>{error}</Text>
      ) : null}
      <Pressable onPress={onHelpPress} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.helpLink, { color: tk.purple }]}>
          Where do I find my team ID?
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 36,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    textAlign: 'center',
  },
  error: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12.5,
  },
  helpLink: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
