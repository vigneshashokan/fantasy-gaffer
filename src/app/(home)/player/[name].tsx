import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { useSquad } from '@/api/squad';
import { useClubs } from '@/api/clubs';
import { Skeleton } from '@/components/ui/Skeleton';
import { Kit } from '@/components/ui/Kit';
import { Icon } from '@/components/ui/Icon';

export default function PlayerDetailModal() {
  const router = useRouter();
  const { name, from } = useLocalSearchParams<{ name: string; from?: string }>();
  const showTransferSuggestions = from !== 'team';
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  const { data: squad, isPending: squadPending } = useSquad();
  const { data: clubs } = useClubs();

  if (squadPending || !squad) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
        <Skeleton height={120} radius={20} />
        <View style={{ height: 12 }} />
        <Skeleton height={180} radius={20} />
      </View>
    );
  }

  const player = [...squad.starters, ...squad.bench].find((p) => p.name === name);

  if (!player) {
    return (
      <View style={[styles.empty, { backgroundColor: tk.bg }]}>
        <Text style={[styles.notFound, { color: tk.text }]}>{name ?? 'Player'} not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: t.primary }]}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const club = clubs?.[player.club];
  if (!club) {
    return (
      <View style={[styles.empty, { backgroundColor: tk.bg }]}>
        <Text style={[styles.notFound, { color: tk.text }]}>Club not loaded</Text>
        <Pressable onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: t.primary }]}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="chevL" color={tk.text} size={24} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tk.text }]}>Player</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.heroCard, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
        <Kit club={player.club} size={72} playerName={player.name} />
        <Text style={[styles.name, { color: tk.text }]}>{player.name}</Text>
        <Text style={[styles.club, { color: tk.faint }]}>{club.name}</Text>
        <View style={styles.posPill}>
          <Text style={styles.posPillText}>{player.pos}</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <Stat label="Price"      value={`£${player.p.toFixed(1)}m`} tk={tk} />
        <Stat label="GW Pts"     value={String(player.gw)}          tk={tk} />
        <Stat label="Total Pts"  value={String(player.tp)}          tk={tk} />
        <Stat label="Form"       value={player.f.toFixed(1)}        tk={tk} />
        <Stat label="Ownership"  value={`${player.own}%`}           tk={tk} />
      </View>

      {showTransferSuggestions && (
        <Text style={[styles.placeholderNote, { color: tk.faint }]}>
          Transfer-target suggestions coming in a follow-up.
        </Text>
      )}
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  tk,
}: {
  label: string;
  value: string;
  tk: ReturnType<typeof apexTokens>;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <Text style={[styles.statLabel, { color: tk.faint }]}>{label}</Text>
      <Text style={[styles.statValue, { color: tk.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 16,
  },
  notFound: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
  },
  closeBtn: {
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  closeText: {
    color: '#fff',
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 15,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 16,
  },
  heroCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontFamily: 'Archivo_900Black',
    fontSize: 26,
    letterSpacing: -0.78,
    marginTop: 12,
  },
  club: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
  },
  posPill: {
    backgroundColor: '#451434',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  posPillText: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.55,
    color: '#FF77B0',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  stat: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 18,
  },
  placeholderNote: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
});
