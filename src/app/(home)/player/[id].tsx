import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';
import { usePlayers } from '@/api/players';
import { useClubs, useClubCodeByTeamId } from '@/api/clubs';
import { useElementSummary, last5FromHistory, next5Fixtures, gwBreakdown } from '@/api/playerSummary';
import { GwBreakdownCard } from '@/components/player/GwBreakdownCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PlayerHero } from '@/components/player/PlayerHero';
import { AvailabilityBanner } from '@/components/player/AvailabilityBanner';
import { KeyStatsRow } from '@/components/player/KeyStatsRow';
import { FormSparkline } from '@/components/player/FormSparkline';
import { FixtureStrip } from '@/components/player/FixtureStrip';

export default function PlayerDetailModal() {
  const router = useRouter();
  const { id, gw } = useLocalSearchParams<{ id: string; gw?: string }>();
  const rawGw = Array.isArray(gw) ? gw[0] : gw;
  const parsedGw = rawGw != null ? Number(rawGw) : NaN;
  const gwNum = Number.isFinite(parsedGw) ? parsedGw : undefined;
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);

  const { data: players, isPending, isError, refetch } = usePlayers();
  const { data: clubs } = useClubs();
  const { data: codeByTeamId } = useClubCodeByTeamId();
  const summary = useElementSummary(id);

  // Same root cause as the tabs: on error `data` is undefined and `isPending`
  // is false, so the skeleton below would win forever (#167).
  if (isError && !players) {
    return <ErrorState tk={tk} onRetry={refetch} onBack={() => router.back()} />;
  }
  if (isPending || !players) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
        <Skeleton height={120} radius={20} />
        <View style={{ height: 12 }} />
        <Skeleton height={180} radius={20} />
      </View>
    );
  }

  const player = players.find((p) => p.id === id);
  if (!player) {
    return (
      <View style={[styles.empty, { backgroundColor: tk.bg }]}>
        <Text style={[styles.notFound, { color: tk.text }]}>Player not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: tk.green }]} accessibilityRole="button">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const clubName = clubs?.[player.club]?.name ?? player.club;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: tk.bg }} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="chevL" color={tk.text} size={24} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tk.text }]}>Player</Text>
        <View style={{ width: 24 }} />
      </View>

      <PlayerHero
        name={player.name}
        club={player.club}
        clubName={clubName}
        pos={player.pos}
        price={player.p}
        ownership={player.own}
        tk={tk}
      />

      <AvailabilityBanner status={player.status} news={player.news} chanceNext={player.chanceNext} tk={tk} />

      {gwNum != null ? (
        summary.data ? (
          <GwBreakdownCard
            breakdown={gwBreakdown(summary.data.history, gwNum, player.pos)}
            codeByTeamId={codeByTeamId ?? {}}
            tk={tk}
          />
        ) : summary.isError ? null : (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Skeleton height={120} radius={16} />
          </View>
        )
      ) : (
        <KeyStatsRow form={player.f} total={player.tp} ep={player.gw} ict={player.ict} bps={player.bps} tk={tk} />
      )}

      {summary.isError ? (
        <SummaryError tk={tk} onRetry={() => summary.refetch()} />
      ) : summary.data ? (
        <>
          <Text style={[styles.sectionTitle, { color: tk.text }]}>Last 5 gameweeks</Text>
          <FormSparkline gameweeks={last5FromHistory(summary.data.history)} tk={tk} />
          <Text style={[styles.sectionTitle, { color: tk.text }]}>Next 5 fixtures</Text>
          <FixtureStrip
            fixtures={next5Fixtures(summary.data.fixtures)}
            codeByTeamId={codeByTeamId ?? {}}
            dark={dark}
            tk={tk}
          />
        </>
      ) : (
        <>
          <Text style={[styles.sectionTitle, { color: tk.text }]}>Last 5 gameweeks</Text>
          <View style={{ paddingHorizontal: 16 }}>
            <Skeleton height={80} radius={14} />
          </View>
          <Text style={[styles.sectionTitle, { color: tk.text }]}>Next 5 fixtures</Text>
          <View style={{ paddingHorizontal: 16 }}>
            <Skeleton height={48} radius={14} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function SummaryError({ tk, onRetry }: { tk: ReturnType<typeof apexTokens>; onRetry: () => void }) {
  return (
    <View style={styles.errRow}>
      <Text style={[styles.errText, { color: tk.faint }]}>Couldn&apos;t load recent form &amp; fixtures.</Text>
      <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.retry, { color: tk.green }]}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 16 },
  notFound: { fontFamily: 'Archivo_700Bold', fontSize: 18 },
  closeBtn: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13 },
  closeText: { color: '#fff', fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontFamily: 'Archivo_800ExtraBold', fontSize: 16 },
  sectionTitle: { fontFamily: 'Archivo_800ExtraBold', fontSize: 15, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 2 },
  errRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  errText: { fontFamily: 'Archivo_500Medium', fontSize: 13, flexShrink: 1 },
  retry: { fontFamily: 'Archivo_800ExtraBold', fontSize: 13 },
});
