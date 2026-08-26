import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { ClubCode } from '@/types/fpl';
import type { NextFixture } from '@/api/playerSummary';
import { StatLinesCard, type StatLine } from './StatLinesCard';

interface SeasonCardProps {
  form: number;
  total: number;
  ep: number;
  ict: number;
  bps: number;
  chanceNext: number | null;
  /** The player's next fixture, once the summary has loaded. */
  next: NextFixture | undefined;
  codeByTeamId: Record<number, ClubCode>;
  tk: ApexTokens;
}

/**
 * The no-gameweek variant of the mock's stats card — opened from Top Picks,
 * where the gameweek hasn't been played. The mock shows only projected points
 * and chance of playing; the season lines below them are ours, and are the
 * numbers the old tile row carried.
 */
export function SeasonCard({
  form, total, ep, ict, bps, chanceNext, next, codeByTeamId, tk,
}: SeasonCardProps) {
  const opp = next ? codeByTeamId[next.opponentTeamId] ?? '—' : null;
  const lines: StatLine[] = [
    { label: 'Projected points', value: ep.toFixed(1) },
    { label: 'Chance of playing', value: `${chanceNext ?? 100}%` },
    { label: 'Form', value: form.toFixed(1) },
    { label: 'Total points', value: String(total) },
    { label: 'ICT', value: ict.toFixed(1) },
    { label: 'BPS', value: String(bps) },
  ];
  return (
    <View style={styles.wrap}>
      <StatLinesCard
        // Off-season, or with the summary still in flight, there is no next
        // fixture to name — fall back to the season the lines describe.
        label={opp ? `GW${next?.event ?? '?'} · ${opp} (${next?.isHome ? 'H' : 'A'})` : 'This season'}
        total={opp ? 'Yet to play' : `${total} pts`}
        totalColor={opp ? tk.yellow : tk.text}
        lines={lines}
        tk={tk}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 16 },
});
