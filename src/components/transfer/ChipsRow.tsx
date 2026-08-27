import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { TransferChip } from '@/types/fpl';
import { ApexTokens } from '@/constants/apexTokens';
import { Icon, type IconName } from '@/components/ui/Icon';

// Keyed by the display name, like `attachChipTips` — `Chip.icon` exists on the
// catalog but never reached `TransferChip`. An unknown name simply draws no
// icon, so a renamed chip degrades to the mock's bare tile rather than crashing.
export const CHIP_ICON: Record<string, IconName> = {
  Wildcard: 'wildcard',
  'Free Hit': 'bolt',
  'Bench Boost': 'benchBoost',
  'Triple Captain': 'captain',
};

interface ChipsRowProps {
  chips: TransferChip[];
  tk: ApexTokens;
  onExpand?: (chipName: string) => void;
}

export function ChipsRow({ chips, tk, onExpand }: ChipsRowProps) {
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
            onToggle={() =>
              setSelected((s) => {
                const next = s === c.name ? null : c.name;
                if (next) onExpand?.(c.name);
                return next;
              })
            }
          />
        ))}
      </ScrollView>

      {tip && (
        <View style={styles.tipWrap}>
          <View style={[styles.tip, { backgroundColor: tk.chipFill }]}>
            <View style={styles.tipHeader}>
              <Icon name="bolt" color="#FFC53D" size={16} />
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
  const fg = sel ? '#fff' : used ? tk.faint : tk.text;

  // The name is the widest thing in here, so the tile is barely wider than its
  // own content — the mock's 118/14x18 left the shorter names marooned.
  const containerStyle = {
    minWidth: 94,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 9,
    backgroundColor: sel ? tk.chipFill : tk.card,
    borderWidth: sel ? 0 : 1.5,
    borderColor: tk.cardBorder,
  };

  return (
    <Pressable
      onPress={used ? undefined : onToggle}
      // Named by the chip name + status text it already renders. `expanded`
      // rather than `selected`: pressing it reveals the tip panel below.
      accessibilityRole="button"
      accessibilityState={{ expanded: sel, disabled: used }}
      style={containerStyle}
    >
      {CHIP_ICON[chip.name] && (
        <View style={styles.icon}>
          <Icon name={CHIP_ICON[chip.name]} color={fg} size={18} />
        </View>
      )}
      <Text
        style={[
          styles.name,
          { color: fg, textDecorationLine: used ? 'line-through' : 'none' },
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  icon: {
    alignItems: 'center',
    marginBottom: 3,
  },
  name: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 15,
    letterSpacing: -0.15,
    textAlign: 'center',
  },
  usedStatus: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
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
    fontSize: 10.5,
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
    fontSize: 13.5,
    color: '#fff',
    letterSpacing: -0.135,
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
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.88)',
  },
});
