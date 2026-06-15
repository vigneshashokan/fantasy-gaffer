import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path, G } from 'react-native-svg';
import type { TopPickPlayer, Position, Fixture, ClubCode } from '@/types/fpl';
import { ApexTokens } from '@/constants/apexTokens';
import { PickRow } from './PickRow';

const FULL: Record<Position, string> = {
  GKP: 'Goalkeepers',
  DEF: 'Defenders',
  MID: 'Midfielders',
  FWD: 'Forwards',
};

interface PicksCardProps {
  pos: Position;
  rows: TopPickPlayer[];
  tk: ApexTokens;
  dark: boolean;
  fixtures: Partial<Record<ClubCode, Fixture>>;
  squadNames: Set<string>;
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function PicksCard({
  pos, rows, tk, dark, fixtures, squadNames,
  selectable = false, selectedId = null, onSelect,
}: PicksCardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tk.card, borderColor: tk.cardBorder },
      ]}
    >
      <View style={styles.header}>
        {pos === 'GKP' ? <GloveGlyph color={tk.text} /> : <PlayerGlyph color={tk.text} />}
        <Text style={[styles.title, { color: tk.text }]}>{FULL[pos]}</Text>
      </View>

      <View
        style={[
          styles.colHeader,
          {
            backgroundColor: tk.headStrip,
            borderTopColor: tk.line,
            borderBottomColor: tk.line,
          },
        ]}
      >
        <View style={[styles.colHeaderPlayer]}>
          <Text style={[styles.colLabel, { color: tk.faint }]}>Player</Text>
        </View>
        <View style={[styles.colHeaderPrice, { borderLeftColor: tk.line }]}>
          <Text style={[styles.colLabel, { color: tk.faint }]}>Price</Text>
        </View>
        <View style={styles.colHeaderForm}>
          <Text style={[styles.colLabel, { color: tk.faint }]}>Form</Text>
        </View>
        <View style={styles.colHeaderXp}>
          <Text style={[styles.colLabelXp, { color: tk.purple }]}>xPts</Text>
        </View>
      </View>

      {rows.map((p, i) => (
        <PickRow
          key={p.name}
          p={p}
          zebra={i % 2 === 1}
          last={i === rows.length - 1}
          tk={tk}
          dark={dark}
          fixtures={fixtures}
          squadNames={squadNames}
          selectable={selectable}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function PlayerGlyph({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Circle cx="13" cy="4.1" r="2.1" fill={color} />
      <G stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M13 6.6 L12.4 13" />
        <Path d="M12.6 8.4 L7.6 6.6" />
        <Path d="M12.8 8 L18 5.4" />
        <Path d="M12.4 13 L9 19.2" />
        <Path d="M12.4 13 L16.6 18.4" />
      </G>
    </Svg>
  );
}

function GloveGlyph({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.8 16.6 L3.8 8.2 a1.5 1.5 0 0 1 3 0 L6.8 11.4 L6.8 6.4 a1.5 1.5 0 0 1 3 0 L9.8 12 a1.5 1.5 0 0 1 0.9 0.4 L10.7 16.6 Z"
        fill={color}
      />
      <Path
        d="M20.2 16.6 L20.2 8.2 a1.5 1.5 0 0 0 -3 0 L17.2 11.4 L17.2 6.4 a1.5 1.5 0 0 0 -3 0 L14.2 12 a1.5 1.5 0 0 0 -0.9 0.4 L13.3 16.6 Z"
        fill={color}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 24,
    letterSpacing: -0.48,
  },
  colHeader: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  colHeaderPlayer: {
    flex: 2,
    justifyContent: 'center',
    paddingVertical: 11,
    paddingLeft: 24,
  },
  colHeaderPrice: {
    flex: 0.68,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 11,
    borderLeftWidth: 1,
  },
  colHeaderForm: {
    flex: 0.52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 11,
  },
  colHeaderXp: {
    flex: 0.56,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 11,
  },
  colLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 0.55,
  },
  colLabelXp: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.55,
  },
});
