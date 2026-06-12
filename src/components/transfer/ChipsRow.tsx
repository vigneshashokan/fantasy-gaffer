import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { TransferChip } from '@/types/fpl';
import { ApexTokens } from '@/constants/apexTokens';

interface ChipsRowProps {
  chips: TransferChip[];
  tk: ApexTokens;
}

export function ChipsRow({ chips, tk }: ChipsRowProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const selChip = chips.find((c) => c.name === selected && c.state !== 'used');
  const tip = selChip?.tip;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {chips.map((c) => (
          <ChipTile
            key={c.name}
            chip={c}
            tk={tk}
            selected={selected === c.name}
            onToggle={() => setSelected((s) => (s === c.name ? null : c.name))}
          />
        ))}
      </ScrollView>

      {tip && (
        <View style={styles.tipWrap}>
          <View style={[styles.tip, { backgroundColor: tk.chipFill }]}>
            <View style={styles.tipHeader}>
              <BoltIcon />
              <Text style={styles.tipTitle}>{tip.title}</Text>
            </View>
            <View style={{ gap: 7 }}>
              {tip.lines.map((ln, i) => (
                <View key={i} style={styles.tipLine}>
                  <View style={[styles.tipDot, { backgroundColor: tk.green }]} />
                  <Text style={styles.tipText}>{ln}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

interface ChipTileProps {
  chip: TransferChip;
  tk: ApexTokens;
  selected: boolean;
  onToggle: () => void;
}

function ChipTile({ chip, tk, selected, onToggle }: ChipTileProps) {
  const used = chip.state === 'used';
  const sel = selected && !used;

  const containerStyle = {
    minWidth: 124,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: sel ? tk.chipFill : tk.card,
    borderWidth: sel ? 0 : 1.5,
    borderColor: tk.cardBorder,
  };

  return (
    <Pressable
      onPress={used ? undefined : onToggle}
      style={containerStyle}
    >
      <Text
        style={[
          styles.name,
          {
            color: sel ? '#fff' : used ? tk.faint : tk.text,
            textDecorationLine: used ? 'line-through' : 'none',
          },
        ]}
      >
        {chip.name}
      </Text>
      <View style={{ marginTop: 6, alignItems: 'center' }}>
        {used ? (
          <Text style={[styles.usedStatus, { color: tk.faint }]}>
            {chip.status}
          </Text>
        ) : (
          <View
            style={[
              styles.available,
              {
                backgroundColor: sel ? 'rgba(255,255,255,0.18)' : tk.greenSoft,
              },
            ]}
          >
            <View
              style={[
                styles.availDot,
                { backgroundColor: sel ? '#fff' : tk.green },
              ]}
            />
            <Text
              style={[
                styles.availText,
                { color: sel ? '#fff' : tk.green },
              ]}
            >
              {chip.status}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function BoltIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z"
        fill="#FFC53D"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  name: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 16,
    letterSpacing: -0.16,
    textAlign: 'center',
  },
  usedStatus: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12,
  },
  available: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  availDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  availText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 0.22,
  },
  tipWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  tip: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 9,
  },
  tipTitle: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 14,
    color: '#fff',
    letterSpacing: -0.14,
  },
  tipLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  tipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 6,
  },
  tipText: {
    flex: 1,
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.88)',
  },
});
