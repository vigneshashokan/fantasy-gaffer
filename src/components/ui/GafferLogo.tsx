import React from 'react';
import { Image, ImageStyle, StyleProp, Text, TextStyle, ViewStyle } from 'react-native';

// PNG natural dimensions:
//   logo-mark.png → 574 × 401 (≈ 1.43 : 1)
const MARK_ASPECT = 574 / 401;

// The wordmark is SET IN TYPE, not artwork (#201). The shipped
// logo-wordmark.png still read "FPL Gaffer" after the 2026-06-19 rebrand, and
// its "-light" companion was broken in the design bundle (whistle outline, no
// text) — which is why the old component always loaded the dark art and
// tintColor'd it white, flattening the mark's green accent.
//
// Setting it in Archivo removes all of that: no stale text, no missing light
// variant, no hardcoded aspect ratio to keep in sync with new art, and the
// colour follows the surface. The mark itself needed no rebrand — it carries no
// text — and still ships as the app icon and splash.
//
// Bespoke lettering is tracked separately and can be dropped straight back in
// behind this same API.
const WORDMARK = 'Fantasy Gaffer';

// Brand ink for light surfaces. Matches theme `primary` / apexTokens `p1`; kept
// literal because this component is deliberately theme-context-free — callers
// already pass `light` to say which surface they are on.
const BRAND_INK = '#37003C';

// Chosen to land on the retired art's footprint so the nine screens using this
// keep their layout: it rendered 683 × 136, i.e. ~231pt wide at the size={46}
// every onboarding screen uses. "Fantasy Gaffer" in Archivo Black at 0.7 × size
// measures ~234pt. lineHeight is pinned to `size` so the box height stays
// exactly what an Image of that height was.
const FONT_SCALE = 0.7;

interface GafferLogoProps {
  size?: number;
  light?: boolean;
  variant?: 'wordmark' | 'mark';
  style?: StyleProp<ViewStyle>;
}

export function GafferLogo({
  size = 30,
  light = false,
  variant = 'wordmark',
  style,
}: GafferLogoProps) {
  if (variant === 'mark') {
    return (
      <Image
        source={require('../../../assets/logos/logo-mark.png')}
        style={[
          { height: size, width: size * MARK_ASPECT },
          light && { tintColor: '#FFFFFF' },
          // Safe: every call site passes layout-only style (alignSelf), which
          // ImageStyle and ViewStyle share.
          style as StyleProp<ImageStyle>,
        ]}
        resizeMode="contain"
      />
    );
  }

  return (
    // No accessibilityRole: a plain Text already reads "Fantasy Gaffer", which
    // is strictly better than the unlabelled Image this replaced. Adding
    // role="header" would invent a heading landmark on nine screens and change
    // rotor navigation, which the #47 VoiceOver pass never covered.
    <Text
      style={[
        {
          fontFamily: 'Archivo_900Black',
          fontSize: size * FONT_SCALE,
          lineHeight: size,
          letterSpacing: -0.5,
          color: light ? '#FFFFFF' : BRAND_INK,
        },
        style as StyleProp<TextStyle>,
      ]}
    >
      {WORDMARK}
    </Text>
  );
}
