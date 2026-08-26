import React, { useEffect } from 'react';
import { track } from '@/lib/analytics';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useThemeStore } from '@/store/themeStore';
import { FLOATING_NAV_SPACE, getTheme, GUTTER } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import type { PitchPlayer, Suggestion } from '@/types/fpl';
import { useApexTeam } from '@/api/squad';
import { usePullRefresh } from '@/lib/query/usePullRefresh';
import { NoSquadCta } from '@/components/team/NoSquadCta';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ApexPitch } from '@/components/pitch/ApexPitch';
import { HeroCard } from '@/components/team/HeroCard';
import { ApexDugout } from '@/components/team/ApexDugout';
import { CaptainPickCard } from '@/components/team/CaptainPickCard';
import { SuggestionsCard } from '@/components/team/SuggestionsCard';
import { CarriedOverNote } from '@/components/team/CarriedOverNote';
import { ApplyAllCard } from '@/components/team/ApplyAllCard';
import { ChipsRow } from '@/components/transfer/ChipsRow';

type GwState = 'live' | 'upcoming' | 'past';

interface GameweekScreenProps {
  gw: number;
  width: number;
  height: number;
  savedCaptain: string;
  pendingCaptain: string;
  pendingSuggestions: Record<string, boolean>;
  onPickCaptain: (name: string) => void;
  onToggleSuggestion: (id: string) => void;
  onToggleAllSuggestions: (next: boolean, suggestions: Suggestion[]) => void;
  onUndo: () => void;
  onConfirm: () => void;
  onOpenPlayer: (p: PitchPlayer) => void;
}

export function GameweekScreen({
  gw,
  width,
  height,
  savedCaptain,
  pendingCaptain,
  pendingSuggestions,
  onPickCaptain,
  onToggleSuggestion,
  onToggleAllSuggestions,
  onUndo,
  onConfirm,
  onOpenPlayer,
}: GameweekScreenProps) {
  const { paletteKey, dark, pitchStyle } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  const { data: at, isPending, isError, noSquad, refetch } = useApexTeam(gw);
  const pull = usePullRefresh(refetch);

  // Decision surfaces are only actionable on the upcoming GW (editable). Fire
  // one decision_viewed per surface when that page's data is ready. (Carousel
  // pre-render can mount adjacent pages — acceptable v1 over-count; the sharper
  // signal is suggestion_expanded below.) deps are primitives so it fires once
  // per page activation, not per refetch.
  const upcoming = at ? gw > at.liveGw : false;
  useEffect(() => {
    if (!at || !upcoming) return;
    track('decision_viewed', { type: 'captain' });
    track('decision_viewed', { type: 'bench' });
    track('decision_viewed', { type: 'chip' });
  }, [gw, upcoming]); // eslint-disable-line react-hooks/exhaustive-deps

  // "No squad yet" is a state, not a failure, so it outranks the error branch.
  // Reachable here for a gameweek earlier than the one this manager joined on,
  // even mid-season.
  if (noSquad) {
    return (
      <View style={{ width, height, backgroundColor: t.bg }}>
        <NoSquadCta tk={tk} gw={gw} />
      </View>
    );
  }
  // Error before pending — otherwise the skeleton branch shadows this one
  // forever, because `data` is undefined on error too (#167).
  if (isError && !at) {
    return <ErrorState tk={tk} onRetry={refetch} style={{ width, height }} />;
  }
  if (isPending || !at) {
    return (
      <View style={{ width, height, backgroundColor: t.bg, padding: GUTTER }}>
        <Skeleton height={48} />
        <View style={{ height: 12 }} />
        <Skeleton height={180} radius={20} />
        <View style={{ height: 12 }} />
        <Skeleton height={260} radius={20} />
      </View>
    );
  }

  const LIVE_GW = at.liveGw;
  const LIVE_GW_FINISHED = at.liveGwFinished;

  const gwState: GwState =
    gw === LIVE_GW ? (LIVE_GW_FINISHED ? 'past' : 'live') : gw > LIVE_GW ? 'upcoming' : 'past';
  const isUpcoming = gwState === 'upcoming';

  const captainChanged = isUpcoming && pendingCaptain !== savedCaptain;
  const suggestionCount = Object.values(pendingSuggestions).filter(Boolean).length;
  const totalChanges = (captainChanged ? 1 : 0) + suggestionCount;

  const heroFrom = t.primary;
  const heroTo = tk.heroBg2;

  const activeChip = at.transfer.chips.find((c) => c.playedGw === gw);

  return (
    <View style={{ width, height, backgroundColor: t.bg }}>
      <ScrollView
        testID="gw-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scroll,
          isUpcoming && totalChanges > 0 && { paddingBottom: FLOATING_NAV_SPACE + 132 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl {...pull} />
        }
      >
        {/* The "Gameweek N" selector and the deadline banner are both pinned
            by the shell (team.tsx), above the carousel — one is the control
            for this carousel, the other the same next deadline on every page. */}
        {isUpcoming && (
          <View style={{ marginBottom: 16 }}>
            <CarriedOverNote from={at.carriedOverFrom} tk={tk} />
          </View>
        )}

        <HeroCard
          totalPoints={at.totalPoints}
          gwPts={at.gwPts}
          avgPoints={at.avgPoints}
          highestPoints={at.highestPoints}
          recentPoints={at.recentPoints}
          gwInProgress={!at.gwFinished}
          upcoming={isUpcoming}
          gradFrom={heroFrom}
          gradTo={heroTo}
        />

        {isUpcoming && (
          <View style={styles.section} testID="chip-tips">
            <Text style={[styles.sectionLabel, { color: tk.faint }]}>Play a Chip</Text>
            <ChipsRow
              chips={at.transfer.chips}
              tk={tk}
              onExpand={(name) =>
                track('suggestion_expanded', {
                  type: 'chip',
                  rank: at.transfer.chips.findIndex((c) => c.name === name),
                })
              }
            />
          </View>
        )}

        <View style={styles.section}>
          {activeChip && (
            <View style={[styles.chipBanner, { backgroundColor: tk.chipFill }]}>
              <BoltGlyph />
              <View style={styles.chipBannerText}>
                <Text style={styles.chipBannerName}>{activeChip.name}</Text>
                <Text style={styles.chipBannerSub}>
                  {gwState === 'live'
                    ? 'Chip active this gameweek'
                    : 'Chip played this gameweek'}
                </Text>
              </View>
            </View>
          )}
          <ApexPitch
            rows={at.pitch}
            pitchStyle={pitchStyle}
            upcoming={isUpcoming}
            onPlayerPress={onOpenPlayer}
          />
        </View>

        <View style={styles.section}>
          <ApexDugout
            players={at.bench}
            card={tk.card}
            cardBorder={tk.cardBorder}
            faint={tk.faint}
            glyphGk={tk.green}
            glyph={tk.purple}
            onPlayerPress={onOpenPlayer}
          />
        </View>

        <View style={styles.section}>
          <CaptainPickCard
            picks={at.captainPicks}
            captainApplied={savedCaptain}
            tk={tk}
            editable={isUpcoming}
            pendingCaptain={pendingCaptain}
            onPick={(name) => {
              track('suggestion_expanded', {
                type: 'captain',
                rank: at.captainPicks.findIndex((p) => p.name === name),
              });
              onPickCaptain(name);
            }}
          />
        </View>

        <View style={styles.section}>
          <SuggestionsCard
            suggestions={at.suggestions}
            tk={tk}
            projectionsReady={at.projectionsReady}
            editable={isUpcoming}
            applied={pendingSuggestions}
            onToggle={(id) => {
              track('suggestion_expanded', {
                type: 'bench',
                rank: at.suggestions.findIndex((s) => s.id === id),
              });
              onToggleSuggestion(id);
            }}
            onToggleAll={(next) => onToggleAllSuggestions(next, at.suggestions)}
            lockedNote={
              gwState === 'live'
                ? 'Gameweek is live — suggestions are locked.'
                : 'Past gameweek — suggestions are locked.'
            }
          />
        </View>
      </ScrollView>

      {isUpcoming && totalChanges > 0 && (
        <View style={styles.applyWrap}>
          <ApplyAllCard count={totalChanges} tk={tk} onUndo={onUndo} onConfirm={onConfirm} />
        </View>
      )}
    </View>
  );
}

function BoltGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z" fill="#FFC53D" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: GUTTER,
    paddingTop: 16,
    // The nav bar floats over this screen, so the content has to end short of
    // it rather than relying on a docked bar to reserve the space.
    paddingBottom: FLOATING_NAV_SPACE + 32,
  },
  section: {
    marginTop: 16,
  },
  sectionLabel: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 1.15,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  chipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  chipBannerText: {
    flex: 1,
  },
  chipBannerName: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 15,
    color: '#fff',
    letterSpacing: -0.15,
  },
  chipBannerSub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 2,
  },
  applyWrap: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    bottom: FLOATING_NAV_SPACE + 16,
    zIndex: 20,
  },
});
