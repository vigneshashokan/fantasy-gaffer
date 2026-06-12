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
import { useCurrentGameweek, useFixturesByGw } from '@/api/fixtures';
import { useSquad } from '@/api/squad';
import { Skeleton } from '@/components/ui/Skeleton';
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

  const { data: gw }                               = useCurrentGameweek();
  const { data: topPicks, isPending: picksPending } = useTopPicks();
  const { data: fixtures }                          = useFixturesByGw(gw ?? 0);
  const { data: squad }                             = useSquad();

  const squadNames = new Set<string>(
    squad ? [...squad.starters, ...squad.bench].map((p) => p.name) : [],
  );

  const goTo = (i: number) => {
    setActive(i);
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
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: tk.text }]}>Top Picks</Text>
          <View style={[styles.livePill, { backgroundColor: tk.greenSoft }]}>
            <View style={[styles.dot, { backgroundColor: tk.green }]} />
            <Text style={[styles.liveText, { color: tk.green }]}>
              GW{gw ?? '—'} LIVE
            </Text>
          </View>
        </View>
        <Text style={[styles.subtitle, { color: tk.variant }]}>
          Top Picks will refresh once the current game week is done.
        </Text>
      </View>

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

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 5,
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 24,
    letterSpacing: -0.48,
    lineHeight: 32,
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
  subtitle: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
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
