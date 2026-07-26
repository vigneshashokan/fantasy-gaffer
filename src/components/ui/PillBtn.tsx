import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { MAX_FONT_SCALE } from '@/lib/a11y';

type Variant = 'solid' | 'accent' | 'ghost' | 'outline';

interface PillBtnProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: Variant;
  style?: ViewStyle;
  primaryColor?: string;
  /** Fill for `variant="accent"`. Pass `t.accent` so the CTA follows the
   *  palette AND the mode — light mode's accent is the darker `accentLight`,
   *  which is what makes white `accentInk` legible on it. */
  accentFill?: string;
  accentInk?: string;
  textColor?: string;
  borderColor?: string;
  disabled?: boolean;
  testID?: string;
}

export function PillBtn({
  children,
  onPress,
  variant = 'solid',
  style,
  primaryColor = '#37003C',
  accentFill = '#00E676',
  accentInk = '#06351E',
  textColor = '#74627E',
  borderColor = 'rgba(40,0,48,0.16)',
  disabled = false,
  testID,
}: PillBtnProps) {
  const containerStyle: ViewStyle = {
    ...styles.base,
    ...(variant === 'solid'   && { backgroundColor: primaryColor }),
    ...(variant === 'accent'  && { backgroundColor: accentFill }),
    ...(variant === 'ghost'   && { backgroundColor: 'transparent' }),
    ...(variant === 'outline' && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor }),
    ...(style as object),
    ...(disabled && { opacity: 0.5 }),
  };
  const textStyle: TextStyle = {
    ...styles.label,
    ...(variant === 'solid'   && { color: '#fff' }),
    ...(variant === 'accent'  && { color: accentInk }),
    ...(variant === 'ghost'   && { color: textColor }),
    ...(variant === 'outline' && { color: textColor }),
  };
  const a11yLabel = typeof children === 'string' ? children : undefined;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [containerStyle, pressed && !disabled && styles.pressed]}
    >
      <Text style={textStyle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  } as ViewStyle,
  label: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 15,
  } as TextStyle,
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
});
