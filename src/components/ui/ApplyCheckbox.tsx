import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon } from './Icon';

interface ApplyCheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  green: string;
  border: string;
  /** Required: the box renders only a tick, so it has no text to be named by. */
  accessibilityLabel: string;
}

export function ApplyCheckbox({
  checked,
  onChange,
  green,
  border,
  accessibilityLabel,
}: ApplyCheckboxProps) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.box,
        {
          backgroundColor: checked ? green : 'transparent',
          borderColor: checked ? green : border,
        },
      ]}
    >
      {checked && <Icon name="check" color="#fff" size={14} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
