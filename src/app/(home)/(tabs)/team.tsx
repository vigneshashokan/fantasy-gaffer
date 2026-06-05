import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { APEX_TEAM, PitchPlayer } from '@/constants/data';
import { ApexPitch } from '@/components/pitch/ApexPitch';
import { HeroCard } from '@/components/team/HeroCard';
import { ApexDugout } from '@/components/team/ApexDugout';
import { CaptainPickCard } from '@/components/team/CaptainPickCard';
import { SuggestionsCard } from '@/components/team/SuggestionsCard';
import { GwNavBar } from '@/components/team/GwNavBar';
import { ApplyAllCard } from '@/components/team/ApplyAllCard';
import { DeadlineBanner } from '@/components/transfer/DeadlineBanner';
import { ChipsRow } from '@/components/transfer/ChipsRow';

const LIVE_GW = APEX_TEAM.gw;
const MIN_GW = 1;
const MAX_GW = LIVE_GW + 1;

type GwState = 'live' | 'upcoming' | 'past';

function stateFor(gw: number): GwState {
  if (gw === LIVE_GW) return 'live';
  if (gw > LIVE_GW) return 'upcoming';
  return 'past';
}

export default function TeamTab() {
  const router = useRouter();
  const { paletteKey, dark, pitchStyle } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);
  const at = APEX_TEAM;

  const [gw, setGw] = useState(LIVE_GW);
  const [savedCaptain, setSavedCaptain] = useState(at.captainApplied);
  const [pendingCaptain, setPendingCaptain] = useState(at.captainApplied);
  const [pendingSuggestions, setPendingSuggestions] = useState<Record<string, boolean>>({});

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
      pathname: '/(home)/player/[name]',
      params: { name: p.name, from: 'team' },
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
              <View style={styles.chipBannerIcon} />
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
    height: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  chipBannerIcon: {
    width: 0,
  },
  applyWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    zIndex: 20,
  },
});
