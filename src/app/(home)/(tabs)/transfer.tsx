import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { track } from '@/lib/analytics';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import type { TransferPitchPlayer } from '@/types/fpl';
import { useApexTeam } from '@/api/squad';
import { useSeasonState, useNextDeadline, currentSeasonLabel } from '@/api/fixtures';
import { LinkTeamCta } from '@/components/team/LinkTeamCta';
import { NoSquadCta } from '@/components/team/NoSquadCta';
import { CarriedOverNote } from '@/components/team/CarriedOverNote';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { TabHeader } from '@/components/ui/TabHeader';
import { TransferInfoCard } from '@/components/transfer/TransferInfoCard';
import { DeadlineBanner } from '@/components/transfer/DeadlineBanner';
import { SeasonCompleteBanner } from '@/components/ui/SeasonCompleteBanner';
import { TransferPitch } from '@/components/transfer/TransferPitch';
import { TransferSuggestionsCard } from '@/components/transfer/TransferSuggestionsCard';
import { ApplyAllCard } from '@/components/team/ApplyAllCard';

export default function TransferTab() {
  const router = useRouter();
  const { paletteKey, dark, pitchStyle } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);
  // Anchor on the gameweek transfers are FOR, not the live one. This tab has no
  // carousel, so it cannot anchor on "the page being viewed" the way
  // GameweekScreen does (#168) — left on the default it scored its 3-gameweek
  // window over [liveGw, +1, +2], starting on a gameweek already in progress
  // and impossible to transfer into, while the banner above it correctly read
  // the NEXT deadline. Undefined once the season is over, which falls back to
  // the live gameweek exactly as before.
  const nextDeadline = useNextDeadline();
  const { data: at, isPending, noTeam, noSquad, isError, isRefetching, refetch } =
    useApexTeam(nextDeadline.data?.gw);
  const { data: seasonState } = useSeasonState();
  const [pendingTransfers, setPendingTransfers] = useState<Record<string, boolean>>({});
  const pendingCount = Object.values(pendingTransfers).filter(Boolean).length;

  useEffect(() => {
    if (at && seasonState?.kind !== 'complete') {
      track('decision_viewed', { type: 'transfer' });
    }
  }, [at, seasonState?.kind]);

  if (noTeam) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg }}>
        <LinkTeamCta tk={tk} variant="transfer" />
      </View>
    );
  }
  // "No squad yet" is a state, not a failure, so it outranks the error branch.
  if (noSquad) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg }}>
        <NoSquadCta tk={tk} />
      </View>
    );
  }
  // Error before pending — `data` is undefined on error too, so the skeleton
  // branch used to shadow this one forever (#167).
  if (isError && !at) {
    return <ErrorState tk={tk} onRetry={refetch} />;
  }
  if (isPending || !at) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
        <Skeleton height={72} radius={20} />
        <View style={{ height: 12 }} />
        <Skeleton height={260} radius={20} />
      </View>
    );
  }
  const tr = at.transfer;
  const seasonOver = seasonState?.kind === 'complete';
  const seasonLabel = currentSeasonLabel();

  const heroFrom = t.primary;
  const heroTo = tk.heroBg2;

  const openTargets = (p: TransferPitchPlayer) => {
    track('transfer_target_opened', { player_id: p.id });
    router.push({
      pathname: '/(home)/transfer-targets/[id]',
      params: { id: p.id },
    });
  };

  const toggleTransfer = (id: string) => {
    const willApply = !pendingTransfers[id];
    if (willApply) {
      track('suggestion_expanded', {
        type: 'transfer',
        rank: tr.transferSuggestions.findIndex((s) => s.id === id),
      });
    }
    setPendingTransfers((s) => ({ ...s, [id]: !s[id] }));
  };

  const toggleAllTransfers = (next: boolean) => {
    const all: Record<string, boolean> = {};
    if (next) tr.transferSuggestions.forEach((s) => (all[s.id] = true));
    setPendingTransfers(all);
  };

  const undo = () => setPendingTransfers({});
  const confirm = () => setPendingTransfers({});

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <TabHeader title="Transfer" tk={tk} />
      {/* Outside the scroller: a deadline countdown is least useful the moment
          it scrolls off, and this tab is long. */}
      <View style={styles.bannerWrap}>
        {seasonOver ? (
          <SeasonCompleteBanner seasonLabel={seasonLabel} tk={tk} />
        ) : (
          <DeadlineBanner nextGw={tr.nextGw} deadline={tr.deadline} tk={tk} />
        )}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          { paddingBottom: 32 },
          pendingCount > 0 && { paddingBottom: 140 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        <View style={styles.topGroup}>
          {!seasonOver && <CarriedOverNote from={at.carriedOverFrom} tk={tk} />}
          <TransferInfoCard
            nextGw={tr.nextGw}
            squadValue={tr.squadValue}
            freeTransfers={tr.freeTransfers}
            inBank={tr.inBank}
            gradFrom={heroFrom}
            gradTo={heroTo}
          />
        </View>

        <View style={styles.pitchWrap}>
          <TransferPitch
            rows={tr.pitch}
            pitchStyle={pitchStyle}
            onPlayerPress={openTargets}
          />
          <Text style={[styles.hint, { color: tk.faint }]}>
            Tap on any player to see transfer targets
          </Text>
        </View>

        {!seasonOver && (
          <View style={styles.suggestionsWrap} testID="transfer-suggestions">
            <TransferSuggestionsCard
              suggestions={tr.transferSuggestions}
              tk={tk}
              applied={pendingTransfers}
              onToggle={toggleTransfer}
              onToggleAll={toggleAllTransfers}
            />
          </View>
        )}
      </ScrollView>

      {pendingCount > 0 && (
        <View style={styles.applyWrap}>
          <ApplyAllCard
            count={pendingCount}
            tk={tk}
            onUndo={undo}
            onConfirm={confirm}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    // Cancels TabHeader's own bottom spacing (paddingBottom 14 + the title
    // row's marginBottom 5) so the banner hangs off the title block: what is
    // left above it is the 36/48 title's line-box leading, which reads as
    // roughly the same 14 as the padding below. The paddingBottom is
    // load-bearing: the ScrollView clips at its own top edge, so without a
    // band here the scrolling content slices itself against the pinned banner.
    marginTop: -19,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  topGroup: {
    paddingHorizontal: 16,
    gap: 14,
  },
  pitchWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  hint: {
    textAlign: 'center',
    fontFamily: 'Archivo_500Medium',
    fontStyle: 'italic',
    fontSize: 13.5,
    paddingVertical: 14,
  },
  suggestionsWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  applyWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    zIndex: 20,
  },
});
