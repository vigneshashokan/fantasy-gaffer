import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { HERO_ON_DARK } from '@/constants/apexTokens';

interface HeroCardProps {
  totalPoints: number;
  gwPts: number;
  avgPoints: number;
  highestPoints: number;
  gwInProgress?: boolean;
  /** Before kickoff there is nothing to score yet — see the two variants below. */
  upcoming?: boolean;
  gradFrom: string;
  gradTo: string;
}

/**
 * The points card, in the v2 mock's two variants.
 *
 * Before the gameweek kicks off every per-gameweek number is zero, so the card
 * leads on the season total and says plainly that the gameweek is still to
 * come. Once it starts, the gameweek's own score takes the lead and the season
 * figures fall back to a column beside it.
 */
export function HeroCard({
  totalPoints,
  gwPts,
  avgPoints,
  highestPoints,
  gwInProgress,
  upcoming,
  gradFrom,
  gradTo,
}: HeroCardProps) {
  const showStat = (val: number) => (gwInProgress && val === 0 ? '—' : val);

  // GW points relative to the gameweek average. Only meaningful once the
  // gameweek has finished (and an average exists).
  const diff = gwPts - avgPoints;
  const up = diff >= 0;
  const showVsAvg = !gwInProgress && avgPoints > 0;
  const vsAvgText = `${up ? '↑' : '↓'} ${diff > 0 ? '+' : ''}${diff} vs avg`;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <CornerGlow color={upcoming ? HERO_ON_DARK.glowUpcoming : HERO_ON_DARK.glowPlayed} />

      {upcoming ? (
        <View style={styles.upcomingInner}>
          <View>
            <Text style={styles.label}>Total Points</Text>
            <Text style={styles.totalBig}>{totalPoints.toLocaleString()}</Text>
          </View>
          <View style={[styles.statePill, { backgroundColor: HERO_ON_DARK.goldPill }]}>
            <Text style={[styles.statePillText, { color: HERO_ON_DARK.gold }]}>Yet to play</Text>
          </View>
        </View>
      ) : (
        <View style={styles.playedInner}>
          <View style={styles.gwBlock}>
            <Text style={styles.gwBig}>{gwPts}</Text>
            <Text style={[styles.label, styles.gwLabel]}>GW Points</Text>
            {showVsAvg && (
              // The hero gradient is dark in BOTH modes, so this pill takes
              // fixed on-dark colours like its sibling stats — `tk.green` is
              // tuned for the light card surface and measured 2.56:1 here.
              // Direction is also carried by the ↑/↓ glyph and the sign, so the
              // colour is not the only signal. The mock only ever draws the
              // positive case; a negative one keeps the neutral wash.
              <View
                style={[
                  styles.vsAvgPill,
                  { backgroundColor: up ? HERO_ON_DARK.upPill : HERO_ON_DARK.pill },
                ]}
              >
                <Text
                  style={[
                    styles.vsAvgText,
                    { color: up ? HERO_ON_DARK.accent : HERO_ON_DARK.muted },
                  ]}
                >
                  {vsAvgText}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.statsCol}>
            <Stat value={totalPoints.toLocaleString()} label="Total Points" />
            <Stat value={showStat(avgPoints)} label="Average" />
            <Stat value={showStat(highestPoints)} label="Highest" />
          </View>
        </View>
      )}
    </View>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[styles.label, styles.statLabel]}>{label}</Text>
    </View>
  );
}

// The mock's radial wash bleeding in from the top-right corner. Its centre sits
// off the card, so only the faded tail shows.
function CornerGlow({ color }: { color: string }) {
  return (
    <Svg
      width={200}
      height={200}
      style={styles.glow}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="heroCornerGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.2} />
          <Stop offset="0.68" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={100} cy={100} r={100} fill="url(#heroCornerGlow)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  glow: {
    position: 'absolute',
    top: -60,
    right: -40,
  },
  upcomingInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
  },
  playedInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  gwBlock: {
    flex: 1.2,
    justifyContent: 'center',
  },
  statsCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 11,
    paddingLeft: 20,
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 1.05,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  gwLabel: {
    marginTop: 7,
  },
  statLabel: {
    fontSize: 9.5,
    letterSpacing: 0.86,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  totalBig: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 48,
    lineHeight: 48,
    letterSpacing: -1.44,
    color: '#fff',
    marginTop: 5,
  },
  gwBig: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 56,
    lineHeight: 53,
    letterSpacing: -1.68,
    color: '#fff',
  },
  statValue: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 18,
    color: '#fff',
  },
  statePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statePillText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 0.44,
  },
  vsAvgPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  vsAvgText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
    letterSpacing: -0.12,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginVertical: 6,
  },
});
