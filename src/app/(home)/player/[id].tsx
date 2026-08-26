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
import { PlayerHero } from '@/components/player/PlayerHero';
import { AvailabilityBanner } from '@/components/player/AvailabilityBanner';
import { SeasonCard } from '@/components/player/SeasonCard';
import { FormSparkline } from '@/components/player/FormSparkline';
import { FixtureStrip } from '@/components/player/FixtureStrip';
import { SectionLabel } from '@/components/player/StatLinesCard';
import { GUTTER } from '@/constants/theme';

/**
 * Presented as a native form sheet (see the `(home)` stack layout) to match the
 * v2 mock's bottom sheet — which is why there is no header row or back button
 * here: the grabber, the drag-down and the scrim are the way out, and iOS/
 * Android give a screen reader the standard escape gesture for them.
 */
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
      <View style={{ flex: 1, backgroundColor: tk.bg, padding: GUTTER }}>
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
  const upcoming = summary.data ? next5Fixtures(summary.data.fixtures) : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: tk.bg }} contentContainerStyle={styles.content}>
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
          <View style={{ paddingHorizontal: GUTTER, paddingTop: 16 }}>
            <Skeleton height={120} radius={20} />
          </View>
        )
      ) : (
        <SeasonCard
          form={player.f}
          total={player.tp}
          ep={player.gw}
          ict={player.ict}
          bps={player.bps}
          chanceNext={player.chanceNext}
          next={upcoming[0]}
          codeByTeamId={codeByTeamId ?? {}}
          tk={tk}
        />
      )}

      {summary.isError ? (
        <SummaryError tk={tk} onRetry={() => summary.refetch()} />
      ) : summary.data ? (
        <>
          <SectionLabel tk={tk}>Last 5 gameweeks</SectionLabel>
          <FormSparkline gameweeks={last5FromHistory(summary.data.history)} tk={tk} />
          <SectionLabel tk={tk}>Next 5 fixtures</SectionLabel>
          <FixtureStrip fixtures={upcoming} codeByTeamId={codeByTeamId ?? {}} dark={dark} tk={tk} />
        </>
      ) : (
        <>
          <SectionLabel tk={tk}>Last 5 gameweeks</SectionLabel>
          <View style={{ paddingHorizontal: GUTTER }}>
            <Skeleton height={92} radius={20} />
          </View>
          <SectionLabel tk={tk}>Next 5 fixtures</SectionLabel>
          <View style={{ paddingHorizontal: GUTTER }}>
            <Skeleton height={62} radius={14} />
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
  // Top padding clears the sheet's grabber; the mock's own is 6 on top of it.
  content: { paddingTop: 12, paddingBottom: 30 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER, gap: 16 },
  notFound: { fontFamily: 'Archivo_700Bold', fontSize: 18 },
  closeBtn: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13 },
  closeText: { color: '#fff', fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  errRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingTop: 12 },
  errText: { fontFamily: 'Archivo_500Medium', fontSize: 13, flexShrink: 1 },
  retry: { fontFamily: 'Archivo_800ExtraBold', fontSize: 13 },
});
