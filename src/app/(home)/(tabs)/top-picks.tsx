import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import type { Position } from '@/types/fpl';
import { useTopPicks } from '@/api/players';
import {
  useCurrentGameweek,
  useFixturesByGw,
  useSeasonState,
  currentSeasonLabel,
  type SeasonPhase,
} from '@/api/fixtures';
import { useSquad } from '@/api/squad';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabHeader } from '@/components/ui/TabHeader';
import { SeasonCompleteBanner } from '@/components/ui/SeasonCompleteBanner';
import { Icon } from '@/components/ui/Icon';
import { SegmentedControl } from '@/components/picks/SegmentedControl';
import { PicksCard } from '@/components/picks/PicksCard';

const ORDER: Position[] = ['GKP', 'DEF', 'MID', 'FWD'];
const H_PADDING = 16;

export default function TopPicksTab() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);
  const { width } = useWindowDimensions();
  const scrollerRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);

  const { data: currentGw }                         = useCurrentGameweek();
  const gw = currentGw?.gw;
  const { data: seasonState }                       = useSeasonState();
  const seasonLabel = currentSeasonLabel();
  const seasonOver = seasonState?.kind === 'complete';
  const { data: topPicks, isPending: picksPending } = useTopPicks();
  const { data: fixtures }                          = useFixturesByGw(gw ?? 0);
  const { data: squad }                             = useSquad();

  const squadNames = new Set<string>(
    squad ? [...squad.starters, ...squad.bench].map((p) => p.name) : [],
  );

  const goTo = (i: number) => {
    // Don't set `active` here. The animated scroll drives `active` via
    // onScroll; jumping it to the target first makes the highlight flash the
    // target, snap back to the origin (onScroll's first frame), then sweep —
    // a flicker. Letting onScroll own `active` makes a tap animate like a swipe.
    scrollerRef.current?.scrollTo({ x: i * width, animated: true });
  };

  // Track active segment while the finger is moving, not just at the end —
  // makes the highlight feel responsive instead of waiting ~300ms for the
  // snap animation to finish.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== active && idx >= 0 && idx < ORDER.length) setActive(idx);
  };

  if (picksPending || !topPicks) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
        <Skeleton height={48} />
        <View style={{ height: 12 }} />
        <Skeleton height={48} />
        <View style={{ height: 12 }} />
        <Skeleton height={48} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <TabHeader
        title="Top Picks"
        tk={tk}
        trailing={
          seasonOver ? undefined : (
            <StatusPill state={seasonState} seasonLabel={seasonLabel} tk={tk} />
          )
        }
        subtitle={
          seasonOver ? undefined : 'Top Picks will refresh once the current game week is done.'
        }
      />

      {seasonOver && (
        <View style={styles.bannerWrap}>
          <SeasonCompleteBanner seasonLabel={seasonLabel} tk={tk} />
        </View>
      )}

      <View style={styles.controlWrap}>
        <SegmentedControl
          options={ORDER}
          value={active}
          onChange={goTo}
          tk={tk}
        />
      </View>

      <ScrollView
        ref={scrollerRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {ORDER.map((pos) => (
          <ScrollView
            key={pos}
            style={{ width }}
            contentContainerStyle={styles.panelContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <PicksCard
                pos={pos}
                rows={topPicks[pos]}
                tk={tk}
                dark={dark}
                fixtures={fixtures ?? {}}
                squadNames={squadNames}
              />
          </ScrollView>
        ))}
      </ScrollView>
    </View>
  );
}

function StatusPill({
  state,
  seasonLabel,
  tk,
}: {
  state: SeasonPhase | undefined;
  seasonLabel: string;
  tk: ReturnType<typeof apexTokens>;
}) {
  if (!state) return null;
  if (state.kind === 'complete') {
    return (
      <View style={[styles.livePill, { backgroundColor: tk.greenSoft }]}>
        <Text style={[styles.liveText, { color: tk.green }]}>{seasonLabel} Season completed</Text>
        <Icon name="check" color={tk.green} size={12} />
      </View>
    );
  }
  if (state.kind === 'live') {
    return (
      <View style={[styles.livePill, { backgroundColor: tk.greenSoft }]}>
        <View style={[styles.dot, { backgroundColor: tk.green }]} />
        <Text style={[styles.liveText, { color: tk.green }]}>GW{state.gw} LIVE</Text>
      </View>
    );
  }
  return (
    <View style={[styles.livePill, { backgroundColor: tk.headStrip }]}>
      <Text style={[styles.liveText, { color: tk.variant }]}>GW{state.gw} Next</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  liveText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10,
    letterSpacing: 0.7,
  },
  controlWrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  panelContent: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 24,
  },
});
