import React, { useState } from 'react';
import { View, TextInput, StyleSheet, KeyboardTypeOptions, Pressable } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { MAX_FONT_SCALE } from '@/lib/a11y';

type IconName = 'mail' | 'lock' | 'person';
// 'new-password' tells password managers to OFFER TO GENERATE rather than fill
// the existing credential — signup and reset-password were asking for
// 'password' on brand-new password fields, so managers suggested the old one
// (#181). iOS additionally needs textContentType, derived here so callers can't
// set one without the other.
type AutoComplete = 'email' | 'password' | 'new-password';

const CONTENT_TYPE: Record<AutoComplete, 'emailAddress' | 'password' | 'newPassword'> = {
  email: 'emailAddress',
  password: 'password',
  'new-password': 'newPassword',
};

interface FieldProps {
  icon: IconName;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: AutoComplete;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  // Keyboard submit flow: 'next' + onSubmitEditing focusing the next field's
  // ref, 'go'/'done' + onSubmitEditing submitting on the last one. Without
  // these the return key was inert on every form.
  returnKeyType?: 'next' | 'go' | 'done' | 'send';
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  surfaceAlt: string;
  line: string;
  accent: string;
  text: string;
  textMuted: string;
  testID?: string;
}

export function Field({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoComplete,
  autoCapitalize = 'none',
  returnKeyType,
  onSubmitEditing,
  inputRef,
  surfaceAlt,
  line,
  accent,
  text,
  textMuted,
  testID,
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
        ref={inputRef}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        placeholderTextColor={textMuted}
        secureTextEntry={hidden}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        textContentType={autoComplete ? CONTENT_TYPE[autoComplete] : undefined}
        autoCapitalize={autoCapitalize}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
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
