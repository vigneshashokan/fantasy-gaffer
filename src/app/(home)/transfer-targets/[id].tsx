import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { useTopPicks } from '@/api/players';
import { useSquad } from '@/api/squad';
import { useClubs } from '@/api/clubs';
import { useCurrentGameweek, useFixturesByGw } from '@/api/fixtures';
import { Skeleton } from '@/components/ui/Skeleton';
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

  const { data: squad, isPending: squadPending } = useSquad();
  const { data: topPicks, isPending: picksPending } = useTopPicks();
  const { data: clubs } = useClubs();
  const { data: currentGw } = useCurrentGameweek();
  const nextGw = Math.min(38, (currentGw?.gw ?? 0) + 1);
  const { data: fixtures } = useFixturesByGw(nextGw);

  const [selectedInId, setSelectedInId] = useState<string | null>(null);

  if (squadPending || picksPending || !squad || !topPicks) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
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
        <Pressable onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: tk.green }]}>
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
        gradTo={dark ? '#0C1018' : '#5B0F63'}
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ padding: 16, gap: 16 }, selectedIn && { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
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
          <ConfirmTransferBar
            outName={out.name}
            inName={selectedIn.name}
            onConfirm={() => {
              // TODO: Phase 6 — route the transfer through the fpl-proxy Edge Function.
            }}
            tk={tk}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 16 },
  notFound: { fontFamily: 'Archivo_700Bold', fontSize: 18 },
  closeBtn: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13 },
  closeText: { color: '#fff', fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  barWrap: { position: 'absolute', left: 16, right: 16, bottom: 24, zIndex: 20 },
  hint: {
    textAlign: 'center',
    fontFamily: 'Archivo_500Medium',
    fontStyle: 'italic',
    fontSize: 13,
    marginBottom: -2,
  },
});
