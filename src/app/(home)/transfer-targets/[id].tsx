import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme, GUTTER } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { useTopPicks } from '@/api/players';
import { useSquad } from '@/api/squad';
import { useClubs } from '@/api/clubs';
import { useFixturesByGw, useNextDeadline } from '@/api/fixtures';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { PicksCard } from '@/components/picks/PicksCard';
import { TransferTargetsHeader } from '@/components/transfer/TransferTargetsHeader';
import { TransferOutCard } from '@/components/transfer/TransferOutCard';
import { ConfirmTransferBar } from '@/components/transfer/ConfirmTransferBar';

export default function TransferTargetsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  const {
    data: squad, isPending: squadPending, isError: squadError,
    isRefetching: squadRefetching, refetch: refetchSquad,
  } = useSquad();
  // The gameweek you can still transfer for — the first whose deadline has not
  // passed. `is_current + 1` was right most of the week and wrong pre-season,
  // and it left the ranking on a different gameweek than the header claimed
  // (#168, same reasoning as the Transfer tab).
  const { data: deadline } = useNextDeadline();
  const {
    data: topPicks, isPending: picksPending, isError: picksError,
    isRefetching: picksRefetching, refetch: refetchPicks, gw: nextGw,
  } = useTopPicks(deadline?.gw);
  const refetch = async () => {
    await Promise.all([refetchSquad(), refetchPicks()]);
  };
  const { data: clubs } = useClubs();
  const { data: fixtures } = useFixturesByGw(nextGw);

  const [selectedInId, setSelectedInId] = useState<string | null>(null);

  // Error before pending — this screen had no error branch at all (#167).
  if ((squadError || picksError) && (!squad || !topPicks)) {
    return <ErrorState tk={tk} onRetry={refetch} onBack={() => router.back()} />;
  }
  if (squadPending || picksPending || !squad || !topPicks) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg, padding: GUTTER }}>
        <Skeleton height={96} radius={20} />
        <View style={{ height: 12 }} />
        <Skeleton height={260} radius={20} />
      </View>
    );
  }

  const all = [...squad.starters, ...squad.bench];
  const out = all.find((p) => p.id === id);
  if (!out) {
    return (
      <View style={[styles.empty, { backgroundColor: tk.bg }]}>
        <Text style={[styles.notFound, { color: tk.text }]}>Player not found</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={[styles.closeBtn, { backgroundColor: tk.green }]}
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const squadNames = new Set(all.map((p) => p.name));
  const rows = topPicks[out.pos];
  const clubName = clubs?.[out.club]?.name ?? out.club;
  const selectedIn = selectedInId ? rows.find((p) => p.id === selectedInId) ?? null : null;

  const toggleSelect = (pid: string) =>
    setSelectedInId((cur) => (cur === pid ? null : pid));

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <TransferTargetsHeader
        pos={out.pos}
        nextGw={nextGw}
        gradFrom={t.primary}
        gradTo={tk.heroBg2}
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ padding: GUTTER, gap: 16 }, selectedIn && { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={squadRefetching || picksRefetching}
            onRefresh={refetch}
          />
        }
      >
        <Text style={[styles.hint, { color: tk.faint }]}>
          Tap to transfer · tap jersey for stats
        </Text>
        <TransferOutCard
          name={out.name}
          clubName={clubName}
          club={out.club}
          price={out.p}
          points={out.tp}
          captain={!!out.capt}
        />
        <PicksCard
          pos={out.pos}
          rows={rows}
          tk={tk}
          dark={dark}
          fixtures={fixtures ?? {}}
          squadNames={squadNames}
          selectable
          selectedId={selectedInId}
          onSelect={toggleSelect}
        />
      </ScrollView>

      {selectedIn && (
        <View style={styles.barWrap}>
          {/* Advisory-only: the bar saves a plan and hands off to the FPL app.
              The real write-back is Phase 6 (fpl-proxy Edge Function). */}
          <ConfirmTransferBar
            outName={out.name}
            inName={selectedIn.name}
            onDone={() => setSelectedInId(null)}
            tk={tk}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER, gap: 16 },
  notFound: { fontFamily: 'Archivo_700Bold', fontSize: 18 },
  closeBtn: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13 },
  closeText: { color: '#fff', fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  barWrap: { position: 'absolute', left: GUTTER, right: GUTTER, bottom: 24, zIndex: 20 },
  hint: {
    textAlign: 'center',
    fontFamily: 'Archivo_500Medium',
    fontStyle: 'italic',
    fontSize: 13,
    marginBottom: -2,
  },
});
