import React, { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * The mock's radial wash bleeding in from a card's top-right corner. Its centre
 * sits off the card, so only the faded tail shows.
 *
 * The gradient id is per-instance: react-native-svg resolves `url(#id)` against
 * a shared namespace, so two cards sharing a literal id would render whichever
 * one mounted last — and both of these live on mounted tabs at once.
 */
export function CornerGlow({ color, opacity }: { color: string; opacity: number }) {
  const id = useId();
  return (
    <Svg
      width={200}
      height={200}
      style={styles.glow}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.68" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={100} cy={100} r={100} fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: -60,
    right: -40,
  },
});
