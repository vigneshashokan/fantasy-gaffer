import React from 'react';
import { View, Image, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { jerseyForClub } from '@/constants/jerseys';
import { clubColorsFor } from '@/constants/clubColors';
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
  // No kit for this club. Reachable whenever FPL promotes a club before we ship
  // its art — codes arrive from Supabase as plain strings, so ClubCode does not
  // prevent it. Show a club-coloured disc with the code rather than an
  // anonymous person glyph: on the green pitch that glyph read as broken or
  // still-loading, which is how #218 hid 26% of the league in plain sight.
  const colors = clubColorsFor(player?.club);
  if (player?.club) {
    return (
      <View
        style={{
          width: size, height: size, borderRadius: size / 2,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors?.kit ?? 'rgba(255,255,255,0.22)',
        }}
      >
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: 'Archivo_700Bold',
            fontSize: size * 0.3,
            color: colors?.ink ?? glyph,
          }}
        >
          {player.club}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <PersonGlyph color={glyph} size={size * 0.5} />
    </View>
  );
}
