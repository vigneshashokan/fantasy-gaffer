import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import { GUTTER } from '@/constants/theme';

export interface StatLine {
  label: string;
  value: string;
  /** Defaults to the body text colour. */
  color?: string;
}

interface StatLinesCardProps {
  /** Small uppercase label, top left — the mock's "GW25 · MUN (H)". */
  label: string;
  /** Big number/phrase, top right. */
  total: string;
  totalColor?: string;
  lines: StatLine[];
  tk: ApexTokens;
}

/**
 * The v2 mock's stats card: a header row (uppercase label / big total) over a
 * list of hairline-divided label→value rows. Shared by the gameweek breakdown
 * and the season card so the two read as the same object.
 */
export function StatLinesCard({ label, total, totalColor, lines, tk }: StatLinesCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: tk.faint }]}>{label}</Text>
        <Text style={[styles.total, { color: totalColor ?? tk.text }]}>{total}</Text>
      </View>
      {lines.map((l) => (
        <View key={l.label} style={[styles.line, { borderTopColor: tk.line }]}>
          <Text style={[styles.lineLabel, { color: tk.text }]}>{l.label}</Text>
          <Text style={[styles.lineValue, { color: l.color ?? tk.text }]}>{l.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Uppercase section heading above the form + fixtures blocks. */
export function SectionLabel({ children, tk }: { children: string; tk: ApexTokens }) {
  return <Text style={[styles.section, { color: tk.faint }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: GUTTER,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 13,
    paddingBottom: 12,
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  total: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 19,
    letterSpacing: -0.38,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    paddingVertical: 11,
  },
  lineLabel: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
    flexShrink: 1,
  },
  lineValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 14.5,
  },
  section: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 1.15,
    textTransform: 'uppercase',
    paddingHorizontal: GUTTER + 2,
    paddingTop: 18,
    paddingBottom: 10,
  },
});
