import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { ClubCode } from '@/types/fpl';
import type { GwBreakdown, GwFixtureBreakdown } from '@/api/playerSummary';

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
        <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
          <Text style={[styles.gwLabel, { color: tk.faint }]}>GW{breakdown.round}</Text>
          <Text style={[styles.note, { color: tk.text }]}>{"Hasn't played yet"}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      {breakdown.fixtures.map((fx, idx) => (
        <FixtureBlock key={`${idx}-${fx.opponentTeamId}-${fx.isHome ? 'H' : 'A'}`} round={breakdown.round} fx={fx} codeByTeamId={codeByTeamId} tk={tk} />
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
  return (
    <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <View style={styles.header}>
        <Text style={[styles.gwLabel, { color: tk.faint }]}>
          GW{round} · {opp} ({venue}){score}
        </Text>
        <Text style={[styles.gwPts, { color: tk.text }]}>{fx.points} pts</Text>
      </View>
      {fx.played ? (
        fx.lines.map((line) => (
          <View key={line.label} style={[styles.line, { borderTopColor: tk.line }]}>
            <Text style={[styles.lineLabel, { color: tk.text }]}>{line.label}</Text>
            <Text style={[styles.linePts, { color: line.points >= 0 ? tk.green : tk.pink }]}>
              {fmt(line.points)}
            </Text>
          </View>
        ))
      ) : (
        <Text style={[styles.note, { color: tk.faint }]}>Did not play</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  gwLabel: { fontFamily: 'Archivo_700Bold', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', flexShrink: 1 },
  gwPts: { fontFamily: 'Archivo_800ExtraBold', fontSize: 18 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingVertical: 9 },
  lineLabel: { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  linePts: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15 },
  note: { fontFamily: 'Archivo_700Bold', fontSize: 15, marginTop: 6 },
});
