import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { ClubCode } from '@/types/fpl';
import type { GwBreakdown, GwFixtureBreakdown } from '@/api/playerSummary';
import { StatLinesCard, type StatLine } from './StatLinesCard';

interface GwBreakdownCardProps {
  breakdown: GwBreakdown;
  codeByTeamId: Record<number, ClubCode>;
  tk: ApexTokens;
}

const fmt = (n: number) => (n > 0 ? `+${n}` : String(n));

export function GwBreakdownCard({ breakdown, codeByTeamId, tk }: GwBreakdownCardProps) {
  if (breakdown.state === 'upcoming') {
    return (
      <View style={styles.wrap}>
        <StatLinesCard
          label={`GW${breakdown.round}`}
          total="Hasn't played yet"
          totalColor={tk.yellow}
          lines={[]}
          tk={tk}
        />
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      {breakdown.fixtures.map((fx, idx) => (
        <FixtureBlock
          key={`${idx}-${fx.opponentTeamId}-${fx.isHome ? 'H' : 'A'}`}
          round={breakdown.round}
          fx={fx}
          codeByTeamId={codeByTeamId}
          tk={tk}
        />
      ))}
    </View>
  );
}

function FixtureBlock({
  round, fx, codeByTeamId, tk,
}: {
  round: number;
  fx: GwFixtureBreakdown;
  codeByTeamId: Record<number, ClubCode>;
  tk: ApexTokens;
}) {
  const opp = codeByTeamId[fx.opponentTeamId] ?? '—';
  const venue = fx.isHome ? 'H' : 'A';
  // Score is shown player's-team-first (the header names the opponent + venue),
  // so swap to away-first when the player's team played away.
  const score =
    fx.teamHScore != null && fx.teamAScore != null
      ? fx.isHome
        ? ` ${fx.teamHScore}–${fx.teamAScore}`
        : ` ${fx.teamAScore}–${fx.teamHScore}`
      : '';
  // The mock colours a zero line faint rather than green — a 0 is neither a
  // gain nor a loss.
  const lines: StatLine[] = fx.played
    ? fx.lines.map((l) => ({
        label: l.label,
        value: fmt(l.points),
        color: l.points > 0 ? tk.green : l.points < 0 ? tk.pink : tk.faint,
      }))
    : [{ label: 'Did not play', value: '0', color: tk.faint }];
  return (
    <StatLinesCard
      label={`GW${round} · ${opp} (${venue})${score}`}
      total={`${fx.points} pts`}
      lines={lines}
      tk={tk}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 16, gap: 12 },
});
