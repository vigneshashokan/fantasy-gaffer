import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ApexTokens } from '@/constants/apexTokens';
import { MAX_FONT_SCALE } from '@/lib/a11y';

interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onPress: () => void;
  tk: ApexTokens;
  external?: boolean;
  showDivider?: boolean;
}

export function SettingsRow({
  icon,
  label,
  sub,
  onPress,
  tk,
  external,
  showDivider,
}: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.row,
        showDivider && { borderTopColor: tk.line, borderTopWidth: 1 },
      ]}
    >
      <View style={styles.iconCell}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.label, { color: tk.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label}</Text>
        {sub && (
          <Text style={[styles.sub, { color: tk.faint }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{sub}</Text>
        )}
      </View>
      {/* An `external` row hands off to another app; everything else stays
          in-app and gets the chevron. The `trailing` override this replaced
          had exactly one caller, which used it to suppress the glyph
          entirely on a row that should have read as external. */}
      <Caret kind={external ? 'external' : 'chevron'} color={tk.faint} />
    </Pressable>
  );
}

function Caret({ kind, color }: { kind: 'chevron' | 'external'; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      {kind === 'external' ? (
        <Path
          d="M7 17L17 7M9 7h8v8"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <Path
          d="M9 6l6 6-6 6"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  iconCell: {
    width: 30,
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  sub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
});
