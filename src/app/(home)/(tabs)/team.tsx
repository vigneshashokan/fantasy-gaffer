import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import type { PitchPlayer, Suggestion } from '@/types/fpl';
import { useApexTeam } from '@/api/squad';
import { useSeasonState, currentSeasonLabel } from '@/api/fixtures';
import { useReducedMotion } from '@/lib/a11y';
import { LinkTeamCta } from '@/components/team/LinkTeamCta';
import { NoSquadCta } from '@/components/team/NoSquadCta';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { TabHeader } from '@/components/ui/TabHeader';
import { SeasonCompleteBanner } from '@/components/ui/SeasonCompleteBanner';
import { DeadlineBanner } from '@/components/transfer/DeadlineBanner';
import { GameweekScreen } from '@/components/team/GameweekScreen';
import { GwArrow } from '@/components/team/GwNav';

const MIN_GW = 1;
const SEASON_FINAL_GW = 38;
// Hide the fixed paging arrows once a gameweek is scrolled past this offset, so
// they don't float over the pitch. Small enough that a tiny nudge keeps them.
const ARROW_HIDE_Y = 24;

export default function TeamTab() {
  const router = useRouter();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  const reduced = useReducedMotion();
  const { width, height: winH } = useWindowDimensions();
  const [areaH, setAreaH] = useState(0);
  // The gameweek currently snapped into view; drives the fixed arrows' targets
  // and disabled state. Null until the first settle — falls back to the live gw.
  const [activeGw, setActiveGw] = useState<number | null>(null);
  const listRef = useRef<FlatList<number>>(null);

  // Hide the fixed arrows while a gameweek is scrolled down. We track scroll per
  // gameweek so the arrows are correct after a horizontal swipe lands on a page
  // that was left scrolled (or fresh at the top).
  const scrollYByGw = useRef<Record<number, number>>({});
  const [arrowsVisible, setArrowsVisible] = useState(true);
  const arrowOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(arrowOpacity, {
      toValue: arrowsVisible ? 1 : 0,
      duration: reduced ? 0 : 160,
      useNativeDriver: true,
    }).start();
  }, [arrowsVisible, arrowOpacity, reduced]);

  // Live team — drives the gating states and the page-list bounds.
  const { data: at, isPending, noTeam, noSquad, isError, refetch } = useApexTeam();
  const { data: seasonState } = useSeasonState();

  const [savedCaptain, setSavedCaptain] = useState('');
  const [pendingCaptain, setPendingCaptain] = useState('');
  const [pendingSuggestions, setPendingSuggestions] = useState<Record<string, boolean>>({});

  const initialized = useRef(false);
  const initialCaptain = at?.captainApplied;
  useEffect(() => {
    if (initialCaptain !== undefined && !initialized.current) {
      initialized.current = true;
      setSavedCaptain(initialCaptain);
      setPendingCaptain(initialCaptain);
    }
  }, [initialCaptain]);

  if (noTeam) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <LinkTeamCta tk={tk} variant="team" />
      </View>
    );
  }
  // "No squad yet" is a state, not a failure, so it outranks the error branch.
  // Both must precede pending: on a picks 404 `at` is null while isPending is
  // false, so `isPending || !at` would swallow either one and pulse forever.
  if (noSquad) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <NoSquadCta tk={tk} />
      </View>
    );
  }
  // Error before pending: on error TanStack reports isPending false with data
  // undefined, so the skeleton branch would otherwise win forever (#167). With
  // cached data present (offline read-cache, #39) we keep rendering it and let
  // pull-to-refresh retry instead of blanking the screen.
  if (isError && !at) {
    return <ErrorState tk={tk} onRetry={refetch} />;
  }
  if (isPending || !at) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>
        <Skeleton height={48} />
        <View style={{ height: 12 }} />
        <Skeleton height={180} radius={20} />
        <View style={{ height: 12 }} />
        <Skeleton height={260} radius={20} />
      </View>
    );
  }

  const liveGw = at.liveGw;
  const maxGw = Math.min(SEASON_FINAL_GW, liveGw + 1);
  const gwList = Array.from({ length: maxGw - MIN_GW + 1 }, (_, i) => MIN_GW + i);
  const initialIndex = liveGw - MIN_GW;
  const pageH = areaH || winH;
  const currentGw = activeGw ?? liveGw;
  const seasonOver = seasonState?.kind === 'complete';
  const seasonLabel = currentSeasonLabel();

  const scrollToGw = (target: number) => {
    const index = target - MIN_GW;
    if (index < 0 || index >= gwList.length) return;
    listRef.current?.scrollToIndex({ index, animated: !reduced });
  };

  const onSettle = (offsetX: number) => {
    if (!width) return;
    const landed = gwList[Math.round(offsetX / width)];
    if (landed != null) {
      setActiveGw(landed);
      setArrowsVisible((scrollYByGw.current[landed] ?? 0) <= ARROW_HIDE_Y);
    }
  };

  const handlePageScroll = (gw: number, y: number) => {
    scrollYByGw.current[gw] = y;
    if (gw === currentGw) setArrowsVisible(y <= ARROW_HIDE_Y);
  };

  const toggleSuggestion = (id: string) =>
    setPendingSuggestions((s) => ({ ...s, [id]: !s[id] }));
  const toggleAllSuggestions = (next: boolean, suggestions: Suggestion[]) => {
    const all: Record<string, boolean> = {};
    if (next) suggestions.forEach((s) => (all[s.id] = true));
    setPendingSuggestions(all);
  };
  const undo = () => {
    setPendingCaptain(savedCaptain);
    setPendingSuggestions({});
  };
  const confirm = () => {
    setSavedCaptain(pendingCaptain);
    setPendingSuggestions({});
  };

  const openPlayer = (p: PitchPlayer, gw: number) =>
    router.push({ pathname: '/(home)/player/[id]', params: { id: p.id, gw: String(gw) } });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TabHeader title={at.teamName} tk={tk} />
      {/* Outside the carousel: a deadline countdown is least useful the moment
          it scrolls away, and it is the same next deadline on every page —
          nextGw, never the page's own gw, or browsing ahead to GW5 would label
          it with GW2's deadline. */}
      <View style={styles.bannerWrap}>
        {seasonOver ? (
          <SeasonCompleteBanner seasonLabel={seasonLabel} tk={tk} />
        ) : (
          <DeadlineBanner
            nextGw={at.transfer.nextGw}
            deadline={at.transfer.deadline}
            tk={tk}
          />
        )}
      </View>
      {/* Carousel area — measured (not the whole screen) so each page's height
          excludes the team-name header and the fixed arrows sit below it. */}
      <View
        style={{ flex: 1 }}
        onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}
      >
        <FlatList
          testID="gw-carousel"
          ref={listRef}
          data={gwList}
          keyExtractor={(g) => String(g)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onScrollToIndexFailed={(info) =>
            listRef.current?.scrollToOffset({ offset: info.index * width, animated: false })
          }
          onMomentumScrollEnd={(e) => onSettle(e.nativeEvent.contentOffset.x)}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          renderItem={({ item }) => (
            <GameweekScreen
              gw={item}
              width={width}
              height={pageH}
              savedCaptain={savedCaptain}
              pendingCaptain={pendingCaptain}
              pendingSuggestions={pendingSuggestions}
              onPickCaptain={setPendingCaptain}
              onToggleSuggestion={toggleSuggestion}
              onToggleAllSuggestions={toggleAllSuggestions}
              onUndo={undo}
              onConfirm={confirm}
              onOpenPlayer={(p) => openPlayer(p, item)}
              onVerticalScroll={(y) => handlePageScroll(item, y)}
            />
          )}
        />

        {/* Fixed paging arrows — pinned at the top edges while the gameweek
            content (incl. the "Gameweek N" pill) swipes beneath them. They fade
            out once the active gameweek is scrolled past the header. */}
        <Animated.View
          style={[styles.arrow, styles.arrowLeft, { opacity: arrowOpacity }]}
          pointerEvents={arrowsVisible ? 'auto' : 'none'}
        >
          <GwArrow
            dir="l"
            onPress={() => scrollToGw(currentGw - 1)}
            disabled={currentGw <= MIN_GW}
            tk={tk}
          />
        </Animated.View>
        <Animated.View
          style={[styles.arrow, styles.arrowRight, { opacity: arrowOpacity }]}
          pointerEvents={arrowsVisible ? 'auto' : 'none'}
        >
          <GwArrow
            dir="r"
            onPress={() => scrollToGw(currentGw + 1)}
            disabled={currentGw >= maxGw}
            tk={tk}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    // Same treatment as the Transfer tab's: cancels TabHeader's own bottom
    // spacing (paddingBottom 14 + the title row's marginBottom 5) so what is
    // left above the banner is the title's line-box leading, matching the gap
    // below it.
    marginTop: -19,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  arrow: {
    position: 'absolute',
    top: 18,
  },
  arrowLeft: {
    left: 16,
  },
  arrowRight: {
    right: 16,
  },
});
