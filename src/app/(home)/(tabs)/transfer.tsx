import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { APEX_TEAM, TransferPitchPlayer } from '@/constants/data';
import { TransferInfoCard } from '@/components/transfer/TransferInfoCard';
import { DeadlineBanner } from '@/components/transfer/DeadlineBanner';
import { TransferPitch } from '@/components/transfer/TransferPitch';
import { TransferSuggestionsCard } from '@/components/transfer/TransferSuggestionsCard';
import { ApplyAllCard } from '@/components/team/ApplyAllCard';

export default function TransferTab() {
  const router = useRouter();
  const { paletteKey, dark, pitchStyle } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);
  const tr = APEX_TEAM.transfer;

  const [pendingTransfers, setPendingTransfers] = useState<Record<string, boolean>>({});
  const pendingCount = Object.values(pendingTransfers).filter(Boolean).length;

  const heroFrom = t.primary;
  const heroTo = dark ? '#0C1018' : '#5B0F63';

  const openPlayer = (p: TransferPitchPlayer) => {
    router.push({
      pathname: '/(home)/player/[name]',
      params: { name: p.name },
    });
  };

  const toggleTransfer = (id: string) =>
    setPendingTransfers((s) => ({ ...s, [id]: !s[id] }));

  const toggleAllTransfers = (next: boolean) => {
    const all: Record<string, boolean> = {};
    if (next) tr.transferSuggestions.forEach((s) => (all[s.id] = true));
    setPendingTransfers(all);
  };

  const undo = () => setPendingTransfers({});
  const confirm = () => setPendingTransfers({});

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          { paddingBottom: 32 },
          pendingCount > 0 && { paddingBottom: 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topGroup}>
          <DeadlineBanner nextGw={tr.nextGw} deadline={tr.deadline} tk={tk} />
          <TransferInfoCard
            teamName={APEX_TEAM.teamName}
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
            onPlayerPress={openPlayer}
          />
          <Text style={[styles.hint, { color: tk.faint }]}>
            Tap on any player to see transfer targets
          </Text>
        </View>

        <View style={styles.suggestionsWrap}>
          <TransferSuggestionsCard
            suggestions={tr.transferSuggestions}
            tk={tk}
            applied={pendingTransfers}
            onToggle={toggleTransfer}
            onToggleAll={toggleAllTransfers}
          />
        </View>
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
  topGroup: {
    paddingHorizontal: 16,
    paddingTop: 14,
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
