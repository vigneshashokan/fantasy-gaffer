import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface GafferLogoProps {
  size?: number;
  light?: boolean;
  variant?: 'wordmark' | 'mark';
  style?: StyleProp<ImageStyle>;
}

export function GafferLogo({
  size = 30,
  light = false,
  variant = 'wordmark',
  style,
}: GafferLogoProps) {
  let src;
  if (variant === 'mark') {
    src = light
      ? require('@/assets/logos/logo-mark-light.png')
      : require('@/assets/logos/logo-mark.png');
  } else {
    src = light
      ? require('@/assets/logos/logo-wordmark-light.png')
      : require('@/assets/logos/logo-wordmark.png');
  }
  const aspect = variant === 'mark' ? 1 : 3.5;
  return (
    <Image
      source={src}
      style={[{ height: size, width: size * aspect }, style]}
      resizeMode="contain"
    />
  );
}
