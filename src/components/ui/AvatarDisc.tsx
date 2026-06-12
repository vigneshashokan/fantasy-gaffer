import React from 'react';
import { View, Image } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { jerseyForClub } from '@/constants/jerseys';
import type { ClubCode } from '@/types/fpl';

interface AvatarDiscPlayer {
  name: string;
  club?: ClubCode;
}

interface AvatarDiscProps {
  size?: number;
  glyph?: string;
  player?: AvatarDiscPlayer;
}

function PersonGlyph({ color = '#fff', size = 26 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.6" fill={color} />
      <Path d="M5.5 19c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" fill={color} />
    </Svg>
  );
}

export function AvatarDisc({ size = 54, glyph = '#FFFFFF', player }: AvatarDiscProps) {
  const jersey = jerseyForClub(player?.club);
  if (jersey) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={jersey}
          style={{ width: size * 1.32, height: size * 1.32 }}
          resizeMode="contain"
        />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <PersonGlyph color={glyph} size={size * 0.5} />
    </View>
  );
}
