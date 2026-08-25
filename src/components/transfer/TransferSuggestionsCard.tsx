import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Kit } from '@/components/ui/Kit';
import { ApplyCheckbox } from '@/components/ui/ApplyCheckbox';
import { ApplyAllToggle } from '@/components/ui/ApplyAllToggle';
import type { TransferSuggestion } from '@/types/fpl';
import { ApexTokens } from '@/constants/apexTokens';

interface TransferSuggestionsCardProps {
  suggestions: TransferSuggestion[];
  tk: ApexTokens;
  applied?: Record<string, boolean>;
  onToggle?: (id: string) => void;
  onToggleAll?: (next: boolean) => void;
  /**
   * False when the model served no projection for the window, so the engine
   * ranked on FPL's ep_next instead. An empty list means two different things
   * either side of that flag and the card must not conflate them.
   */
  projectionsReady?: boolean;
}

export function TransferSuggestionsCard({
  suggestions,
  tk,
  applied = {},
  onToggle,
  onToggleAll,
  projectionsReady = true,
}: TransferSuggestionsCardProps) {
  const allChecked =
    suggestions.length > 0 && suggestions.every((s) => !!applied[s.id]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tk.card, borderColor: tk.cardBorder },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .9 1.6l.2 1h4.8l.2-1c.1-.6.4-1.2.9-1.6A6 6 0 0012 3z"
              fill={tk.yellow}
            />
            <Path
              d="M9.5 19.5h5M10 21.5h4"
              stroke={tk.yellow}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>
          <Text style={[styles.title, { color: tk.text }]}>Transfer Suggestions</Text>
        </View>
        {onToggleAll && suggestions.length > 0 && (
          <ApplyAllToggle
            checked={allChecked}
            onToggle={() => onToggleAll(!allChecked)}
            tk={tk}
          />
        )}
      </View>

      {suggestions.length === 0 && (
        <Text style={[styles.empty, { color: tk.faint }]}>
          {projectionsReady
            ? 'No transfer beats what you already have over the next 3 gameweeks.'
            : "Projections aren't in for these gameweeks yet, so there's nothing to rank."}
        </Text>
      )}

      {suggestions.map((s, i) => {
        const done = !!applied[s.id];
        return (
          <View
            key={s.id}
            style={[
              styles.row,
              {
                backgroundColor: done ? tk.greenSoft : 'transparent',
                borderColor: done ? tk.green : 'transparent',
                marginTop: i === 0 ? 12 : 8,
              },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.swapRow}>
                <Kit club={s.outClub} size={24} playerName={s.out} />
                <Text style={[styles.out, { color: tk.pink }]} numberOfLines={1}>
                  {s.out}
                </Text>
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke={tk.faint}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
                <Kit club={s.inClub} size={24} playerName={s.in} />
                <Text style={[styles.in, { color: tk.green }]} numberOfLines={1}>
                  {s.in}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <View style={[styles.gain, { backgroundColor: tk.greenSoft }]}>
                  <Text style={[styles.gainText, { color: tk.green }]}>{s.gain}</Text>
                </View>
                <Text style={[styles.detail, { color: tk.faint }]} numberOfLines={2}>
                  {s.detail}
                </Text>
              </View>
            </View>
            {onToggle && (
              <ApplyCheckbox
                checked={done}
                onChange={() => onToggle(s.id)}
                green={tk.green}
                border={tk.cardBorder}
                accessibilityLabel={`Apply transfer: ${s.out} out, ${s.in} in`}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 17,
    letterSpacing: -0.17,
  },
  empty: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 13,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  out: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    letterSpacing: -0.14,
  },
  in: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    letterSpacing: -0.14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 5,
  },
  gain: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 1,
  },
  gainText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
  },
  detail: {
    flex: 1,
    fontFamily: 'Archivo_500Medium',
    fontSize: 11.5,
    lineHeight: 16,
  },
});
