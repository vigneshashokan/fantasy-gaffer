import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import type { PitchPlayer } from '@/types/fpl';
import { useApexTeam } from '@/api/squad';
import { LinkTeamCta } from '@/components/team/LinkTeamCta';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApexPitch } from '@/components/pitch/ApexPitch';
import { HeroCard } from '@/components/team/HeroCard';
import { ApexDugout } from '@/components/team/ApexDugout';
import { CaptainPickCard } from '@/components/team/CaptainPickCard';
import { SuggestionsCard } from '@/components/team/SuggestionsCard';
import { GwNavBar } from '@/components/team/GwNavBar';
import { ApplyAllCard } from '@/components/team/ApplyAllCard';
import { DeadlineBanner } from '@/components/transfer/DeadlineBanner';
import { ChipsRow } from '@/components/transfer/ChipsRow';

type GwState = 'live' | 'upcoming' | 'past';

export default function TeamTab() {
  const router = useRouter();
  const { paletteKey, dark, pitchStyle } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  const [gw, setGw] = useState(0);
  const { data: at, isPending, noTeam, isError } = useApexTeam(gw > 0 ? gw : undefined);

  const [savedCaptain, setSavedCaptain] = useState('');
  const [pendingCaptain, setPendingCaptain] = useState('');
  const [pendingSuggestions, setPendingSuggestions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (at && gw === 0) {
      setGw(at.gw);
      setSavedCaptain(at.captainApplied);
      setPendingCaptain(at.captainApplied);
    }
  }, [at?.gw, at?.captainApplied, gw]);

  if (noTeam) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <LinkTeamCta tk={tk} variant="team" />
      </View>
    );
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
  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>
        <Text style={{ color: tk.text, fontFamily: 'Archivo_700Bold' }}>
          Could not reach FPL. Pull to retry.
        </Text>
      </View>
    );
  }

  const LIVE_GW = at.liveGw;
  const LIVE_GW_FINISHED = at.liveGwFinished;
  const MIN_GW = 1;
  const SEASON_FINAL_GW = 38;
  const MAX_GW = Math.min(SEASON_FINAL_GW, LIVE_GW + 1);

  function stateFor(gwArg: number): GwState {
    if (gwArg === LIVE_GW) return LIVE_GW_FINISHED ? 'past' : 'live';
    if (gwArg > LIVE_GW) return 'upcoming';
    return 'past';
  }

  const gwState = stateFor(gw);
  const isUpcoming = gwState === 'upcoming';

  const captainChanged = isUpcoming && pendingCaptain !== savedCaptain;
  const suggestionCount = Object.values(pendingSuggestions).filter(Boolean).length;
  const totalChanges = (captainChanged ? 1 : 0) + suggestionCount;

  const heroFrom = t.primary;
  const heroTo = dark ? '#0C1018' : '#5B0F63';

  const toggleSuggestion = (id: string) =>
    setPendingSuggestions((s) => ({ ...s, [id]: !s[id] }));

  const toggleAllSuggestions = (next: boolean) => {
    const all: Record<string, boolean> = {};
    if (next) at.suggestions.forEach((s) => (all[s.id] = true));
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

  const openPlayer = (p: PitchPlayer) => {
    router.push({
      pathname: '/(home)/player/[id]',
      params: { id: p.id },
    });
  };

  const activeChip = at.transfer.chips.find((c) => c.playedGw === gw);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scroll,
          isUpcoming && totalChanges > 0 && { paddingBottom: 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <GwNavBar
          gw={gw}
          state={gwState}
          onPrev={() => setGw((g) => Math.max(MIN_GW, g - 1))}
          onNext={() => setGw((g) => Math.min(MAX_GW, g + 1))}
          disablePrev={gw <= MIN_GW}
          disableNext={gw >= MAX_GW}
          tk={tk}
        />

        {isUpcoming && (
          <View style={{ marginBottom: 16 }}>
            <DeadlineBanner nextGw={gw} deadline={at.transfer.deadline} tk={tk} />
          </View>
        )}

        <HeroCard
          teamName={at.teamName}
          totalPoints={at.totalPoints}
          gwPts={at.gwPts}
          avgPoints={at.avgPoints}
          highestPoints={at.highestPoints}
          gwInProgress={!at.gwFinished}
          gradFrom={heroFrom}
          gradTo={heroTo}
        />

        {isUpcoming && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tk.faint }]}>Play a Chip</Text>
            <ChipsRow chips={at.transfer.chips} tk={tk} />
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
            onPlayerPress={openPlayer}
          />
        </View>

        <View style={styles.section}>
          <ApexDugout
            players={at.bench}
            card={tk.card}
            cardBorder={tk.cardBorder}
            faint={tk.faint}
          />
        </View>

        <View style={styles.section}>
          <CaptainPickCard
            picks={at.captainPicks}
            captainApplied={savedCaptain}
            tk={tk}
            editable={isUpcoming}
            pendingCaptain={pendingCaptain}
            onPick={setPendingCaptain}
          />
        </View>

        <View style={styles.section}>
          <SuggestionsCard
            suggestions={at.suggestions}
            tk={tk}
            editable={isUpcoming}
            applied={pendingSuggestions}
            onToggle={toggleSuggestion}
            onToggleAll={toggleAllSuggestions}
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
          <ApplyAllCard
            count={totalChanges}
            tk={tk}
            onUndo={undo}
            onConfirm={confirm}
          />
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  section: {
    marginTop: 16,
  },
  sectionLabel: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 12,
    letterSpacing: 1.2,
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
    left: 16,
    right: 16,
    bottom: 24,
    zIndex: 20,
  },
});
