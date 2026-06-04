import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  onColor: string;
  offColor: string;
  size?: 'sm' | 'md';
}

export function Toggle({
  value,
  onChange,
  onColor,
  offColor,
  size = 'md',
}: ToggleProps) {
  const dims = size === 'sm'
    ? { w: 44, h: 26, knob: 21, gap: 2.5 }
    : { w: 46, h: 27, knob: 22, gap: 2.5 };

  return (
    <Pressable
      onPress={() => onChange(!value)}
      hitSlop={6}
      style={[
        styles.track,
        {
          width: dims.w,
          height: dims.h,
          borderRadius: dims.h / 2,
          backgroundColor: value ? onColor : offColor,
        },
      ]}
    >
      <View
        style={[
          styles.knob,
          {
            top: dims.gap,
            left: value ? dims.w - dims.knob - dims.gap : dims.gap,
            width: dims.knob,
            height: dims.knob,
            borderRadius: dims.knob / 2,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'relative',
  },
  knob: {
    position: 'absolute',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
