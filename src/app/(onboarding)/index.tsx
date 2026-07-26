import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { Icon } from '@/components/ui/Icon';
import { SlideVisual } from '@/components/onboarding/SlideVisual';
import { useReducedMotion } from '@/lib/a11y';

type SlideVariant = 'picks' | 'team' | 'strategy';

interface Slide {
  tag: string;
  title: [string, string];
  body: string;
  variant: SlideVariant;
}

const SLIDES: Slide[] = [
  {
    tag: 'Top Picks',
    title: ['Scout the most', 'in-form players'],
    body: 'The highest-scoring keepers, defenders, mids and forwards — ranked and ready to pick!',
    variant: 'picks',
  },
  {
    tag: 'My Team',
    title: ['Run your', 'side, your way'],
    body: 'Your full starting XI on the pitch with live gameweek points on every shirt.',
    variant: 'team',
  },
  {
    tag: 'Strategy',
    title: ['Time your', 'chips to win!'],
    body: 'Track Wildcards, Free Hits and Bench Boost — and plan transfers before the deadline.',
    variant: 'strategy',
  },
];

export default function Landing() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [i, setI] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const reduced = useReducedMotion();
  const last = i === SLIDES.length - 1;

  // The slides live in a paged ScrollView so horizontal swipe — the gesture
  // every user tries first on a carousel — actually advances them (#181). As
  // in Top Picks, onScroll owns `i`: setting it on tap first would flash the
  // target, snap back on the scroll's first frame, then sweep.
  const goTo = (index: number) =>
    pagerRef.current?.scrollTo({ x: index * width, animated: !reduced });
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== i && idx >= 0 && idx < SLIDES.length) setI(idx);
  };

  const goSignIn = () => router.push('/(onboarding)/signin');
  const next = () => (last ? goSignIn() : goTo(i + 1));

  return (
    <View style={{ flex: 1, backgroundColor: '#37003C' }}>
      <LinearGradient
        colors={['#37003C', '#6A0060']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* glow blobs — purely decorative, hidden from accessibility tree */}
      <View style={styles.glowGreen} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      <View style={styles.glowPink} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

      <View style={[styles.content, { paddingTop: Math.max(60, height * 0.08) }]}>
        <GafferLogo size={32} light variant="wordmark" style={{ alignSelf: 'center' }} />

        <ScrollView
          testID="onboarding-pager"
          ref={pagerRef}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {SLIDES.map((slide) => (
            <View key={slide.tag} style={[styles.page, { width }]}>
              <View style={styles.hero}>
                <SlideVisual variant={slide.variant} />
              </View>
              <View>
                <Text style={styles.tag}>{slide.tag}</Text>
                <Text style={styles.title}>{slide.title[0]}</Text>
                <Text style={styles.title}>{slide.title[1]}</Text>
                <Text style={styles.body}>{slide.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.controls}>
          <Pressable onPress={goSignIn} hitSlop={8} accessibilityRole="button" testID="onboarding-signin-link">
            <Text style={styles.skip}>Skip intro</Text>
          </Pressable>

          <View style={styles.dots}>
            {SLIDES.map((_, d) => (
              <Pressable
                key={d}
                onPress={() => goTo(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: d === i }}
                accessibilityLabel={`Go to slide ${d + 1}`}
                hitSlop={8}
                style={[
                  styles.dot,
                  d === i ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          <Pressable onPress={next} style={[styles.cta, last && styles.ctaLast]} accessibilityRole="button" accessibilityLabel={last ? 'Sign in' : 'Next'}>
            <Text style={[styles.ctaText, last && styles.ctaTextLast]}>
              {last ? 'Sign in' : 'Next'}
            </Text>
            <Icon name="arrowR" color={last ? '#06351E' : '#37003C'} size={18} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glowGreen: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(0,255,135,0.30)',
    opacity: 0.7,
  },
  glowPink: {
    position: 'absolute',
    bottom: 120,
    left: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(233,0,82,0.28)',
    opacity: 0.7,
  },
  content: {
    flex: 1,
    paddingBottom: 30,
  },
  // The pager spans the full width so pages snap edge-to-edge; the 26pt gutter
  // that used to live on `content` moves onto each page and the fixed rows.
  // Width only — the cross axis stretches to the pager's height (same shape as
  // the Top Picks pager), and `flex` here would fight the fixed page width.
  page: {
    paddingHorizontal: 26,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  tag: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 13,
    letterSpacing: 2.86,
    textTransform: 'uppercase',
    color: '#00FF87',
    marginBottom: 14,
  },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -0.95,
    color: '#fff',
  },
  body: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 14,
    maxWidth: 320,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    paddingHorizontal: 26,
  },
  skip: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
  },
  dot: {
    height: 8,
    borderRadius: 999,
  },
  dotActive: {
    width: 26,
    backgroundColor: '#00FF87',
  },
  dotInactive: {
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#fff',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  ctaLast: {
    backgroundColor: '#00FF87',
    paddingHorizontal: 26,
  },
  ctaText: {
    fontFamily: 'Archivo_900Black',
    fontSize: 15,
    color: '#37003C',
  },
  ctaTextLast: {
    color: '#06351E',
  },
});
