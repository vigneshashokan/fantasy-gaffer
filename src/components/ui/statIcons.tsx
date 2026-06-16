import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

// Single swap point for the stat icon set. Keep new icons on the same 0 0 24 24
// viewBox and similar visual weight and they're a drop-in; very different
// proportions may need small offset/width tweaks in PitchBadges' stack styles.

export function BallIcon({ size = 15, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10.5} fill={color} />
      <Path d="M12 6.6l3.4 2.5-1.3 4h-4.2l-1.3-4z" fill="#0B1224" />
      <Path
        d="M12 3.6v3M5.8 8.4l2.6 1.1M18.2 8.4l-2.6 1.1M9 16.6l1.1-3.5M15 16.6l-1.1-3.5"
        stroke="#0B1224"
        strokeWidth={1.15}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function BootIcon({ size = 15, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 12.4c0-1.8 1-3.1 3-3.3l3.1-.3 6.4 3.1c2.4 1 4.4 1.1 5.4 1.6.7.35 1 .9 1 1.6v.4c0 1-.8 1.8-1.8 1.8H4.6C3.7 18.7 3 17.9 3 16.9z"
        fill={color}
      />
      <Path d="M5 19.3h15.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
