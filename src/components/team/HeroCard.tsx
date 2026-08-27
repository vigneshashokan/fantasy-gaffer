import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HERO_ON_DARK } from '@/constants/apexTokens';
import { Icon } from '@/components/ui/Icon';
import { CornerGlow } from '@/components/ui/CornerGlow';
import { useReducedMotion } from '@/lib/a11y';

interface HeroCardProps {
  totalPoints: number;
  gwPts: number;
  avgPoints: number;
  highestPoints: number;
  /** Points for the five gameweeks before this one, oldest first. */
  recentPoints?: number[];
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
  recentPoints,
  gwInProgress,
  upcoming,
  gradFrom,
  gradTo,
}: HeroCardProps) {
  const showStat = (val: number) => (gwInProgress && val === 0 ? '—' : val);
  const shownPts = useCountUp(gwPts, !upcoming);

  // GW points relative to the gameweek average. Only meaningful once the
  // gameweek has finished (and an average exists).
  const diff = gwPts - avgPoints;
  const up = diff >= 0;
  const showVsAvg = !gwInProgress && avgPoints > 0;
  const vsAvgText = `${diff > 0 ? '+' : ''}${diff} vs avg`;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {upcoming ? (
        <CornerGlow color={HERO_ON_DARK.glowUpcoming} opacity={0.18} />
      ) : (
        <CornerGlow color={HERO_ON_DARK.glowPlayed} opacity={0.2} />
      )}

      {upcoming ? (
        <View style={styles.upcomingInner}>
          <View style={styles.totalBlock}>
            <Text style={styles.label}>Total Points</Text>
            <Text style={styles.totalBig}>{totalPoints.toLocaleString()}</Text>
          </View>
          {recentPoints?.length ? (
            <FormBars points={recentPoints} />
          ) : (
            // Not in the mock, which always has five gameweeks to draw. Before
            // the season's first deadline there are none, and a card carrying
            // one lonely zero reads as broken rather than as not-started.
            <View style={[styles.statePill, { backgroundColor: HERO_ON_DARK.goldPill }]}>
              <Text
                style={[styles.statePillText, { color: HERO_ON_DARK.gold }]}
                numberOfLines={1}
              >
                Yet to play
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.playedInner}>
          <View style={styles.gwBlock}>
            <Text style={styles.gwBig}>{shownPts}</Text>
            <Text style={[styles.label, styles.gwLabel]}>GW Points</Text>
            {showVsAvg && (
              // The hero gradient is dark in BOTH modes, so this pill takes
              // fixed on-dark colours like its sibling stats — `tk.green` is
              // tuned for the light card surface and measured 2.56:1 here.
              // Direction is also carried by the arrow and the sign, so the
              // colour is not the only signal. The mock only ever draws the
              // positive case; a negative one keeps the neutral wash.
              <View
                style={[
                  styles.vsAvgPill,
                  { backgroundColor: up ? HERO_ON_DARK.upPill : HERO_ON_DARK.pill },
                ]}
              >
                <Icon
                  name={up ? 'arrowUp' : 'arrowDown'}
                  color={up ? HERO_ON_DARK.accent : HERO_ON_DARK.muted}
                  size={11}
                />
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

/**
 * The mock counts the gameweek's score up from zero over a second, easing out.
 * Driven by `requestAnimationFrame` + state rather than Animated, because the
 * number is the text itself and neither Animated nor reanimated can drive that
 * without a per-frame listener doing exactly this anyway.
 */
function useCountUp(target: number, enabled: boolean): number {
  const [shown, setShown] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!enabled || reduced) {
      setShown(target);
      return;
    }
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / COUNT_UP_MS);
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, reduced]);
  return shown;
}

const COUNT_UP_MS = 1000;

/**
 * The last five gameweeks as bars, tallest = best of the five. A gameweek at or
 * above the five's own average is green, below it red — a relative read, so the
 * colours say "good week for you", not "good week".
 */
function FormBars({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const avg = points.reduce((a, b) => a + b, 0) / points.length;
  return (
    <View style={styles.formCol}>
      <View style={styles.formRow}>
        {points.map((p, i) => (
          <View key={i} style={styles.formBarCol}>
            <Text style={styles.formPts}>{p}</Text>
            <View
              testID="form-bar"
              style={[
                styles.formBar,
                {
                  // max is 0 only if every one of the five is 0 — then they all
                  // draw at the floor height rather than dividing by zero.
                  height: Math.round(14 + (max > 0 ? p / max : 0) * 30),
                  backgroundColor: p >= avg ? HERO_ON_DARK.formUp : HERO_ON_DARK.formDown,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <Text style={styles.formLabel}>Last 5 Gameweeks</Text>
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
  upcomingInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 18,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 20,
  },
  totalBlock: {
    // The row bottom-aligns so the form bars sit on one baseline; the total
    // opts out and centres against the full height of that column instead.
    alignSelf: 'center',
    // Takes the space the bars leave and centres in it, like the played
    // variant's GW block. The mock pins this to the left edge, which left the
    // number stranded against a wide gap once the bars replaced the pill.
    flex: 1,
    alignItems: 'center',
  },
  playedInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  gwBlock: {
    flex: 1,
    justifyContent: 'center',
    // The card pads 20 on the left, so centring inside the column alone would
    // land 10pt right of true centre — matching that padding on the right
    // cancels it, and the block sits centred between the edge and the divider.
    alignItems: 'center',
    paddingRight: 20,
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
    marginTop: 6,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  vsAvgText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
  },
  formCol: {
    alignItems: 'flex-end',
    gap: 9,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
  },
  formBarCol: {
    alignItems: 'center',
    gap: 5,
  },
  formPts: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.7)',
  },
  formBar: {
    width: 13,
    borderRadius: 6,
  },
  formLabel: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginVertical: 6,
  },
});
