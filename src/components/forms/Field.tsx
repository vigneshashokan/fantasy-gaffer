import React, { useState } from 'react';
import { View, TextInput, StyleSheet, KeyboardTypeOptions, Pressable } from 'react-native';
import { Icon } from '@/components/ui/Icon';

type IconName = 'mail' | 'lock' | 'person';

interface FieldProps {
  icon: IconName;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: 'email' | 'password';
  surfaceAlt: string;
  line: string;
  accent: string;
  text: string;
  textMuted: string;
}

export function Field({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoComplete,
  surfaceAlt,
  line,
  accent,
  text,
  textMuted,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hidden = secureTextEntry && !revealed;
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: surfaceAlt, borderColor: focused ? accent : line },
      ]}
    >
      <Icon name={icon} color={textMuted} size={20} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={textMuted}
        secureTextEntry={hidden}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize="none"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, { color: text }]}
      />
      {secureTextEntry && (
        <Pressable
          onPress={() => setRevealed((r) => !r)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
        >
          <Icon name={revealed ? 'eyeOff' : 'eye'} color={textMuted} size={20} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 16,
    padding: 0,
  },
});
