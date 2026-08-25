import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';
import { MAX_FONT_SCALE, useReducedMotion } from '@/lib/a11y';

export type TabName = 'top-picks' | 'team' | 'transfer';

export const TABS: { name: TabName; label: string; icon: 'fire' | 'team' | 'swap' }[] = [
  { name: 'top-picks', label: 'Top Picks', icon: 'fire' },
  { name: 'team', label: 'My Team', icon: 'team' },
  { name: 'transfer', label: 'Transfer', icon: 'swap' },
];

// Mock geometry: the bar is `padding: 8px 10px`, and the sliding pill insets a
// pixel further (`top/bottom: 7`, `left: 10`) so it reads slightly taller than
// the icon+label stack it sits behind.
const PAD_X = 10;
const PAD_Y = 8;
const PILL_INSET = PAD_Y - 1;
const SLOTS = TABS.length + 1; // + Account
const SPRING = { damping: 16, stiffness: 190, mass: 0.6 };

// The bar's own height (2×8 padding + 2×6 slot padding + 22 icon + 3 gap +
// ~12 label + 2 border) plus `barBottom` is what `FLOATING_NAV_SPACE` in
// constants/theme.ts reserves on every tab screen. Change one, check the other.

/**
 * Distance from the bottom of the screen to the bar. The mock's 28pt is
 * measured on a device with a home indicator (34pt inset) — it sits inside
 * that inset but clears the indicator itself. On a device with no inset, 28
 * would float oddly high, so it collapses to a plain 16.
 */
function barBottom(insetBottom: number) {
  return Math.max(insetBottom - 6, 16);
}

interface FloatingNavProps {
  activeName: TabName;
  onSelect: (name: TabName) => void;
  onAccount: () => void;
  /** Account is the "active" slot while its menu is open, as in the mock. */
  menuOpen: boolean;
  initials: string;
  tk: ApexTokens;
}

export function FloatingNav({
  activeName,
  onSelect,
  onAccount,
  menuOpen,
  initials,
  tk,
}: FloatingNavProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // The pill is one sliding view, not a per-tab background swap — a swap can't
  // animate. Same shape as the Top Picks SegmentedControl.
  const [barW, setBarW] = useState(0);
  const slotW = barW ? (barW - PAD_X * 2) / SLOTS : 0;
  const index = menuOpen ? TABS.length : TABS.findIndex((t) => t.name === activeName);

  // Animate the slot INDEX, not the pixel offset: `slotW` goes 0 -> measured on
  // the first layout pass, and animating pixels would make the pill slide in
  // from the left edge on every mount, which the mock does not do.
  const slot = useSharedValue(Math.max(index, 0));
  useEffect(() => {
    const target = Math.max(index, 0);
    // The mock's cubic-bezier(.3,1.35,.6,1) overshoots slightly before settling.
    slot.value = reduceMotion ? target : withSpring(target, SPRING);
  }, [index, reduceMotion, slot]);

  const pillStyle = useAnimatedStyle(() => ({
    width: slotW,
    transform: [{ translateX: slot.value * slotW }],
    opacity: slotW ? 1 : 0, // nothing to place before onLayout measures the bar
  }));

  return (
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setBarW(e.nativeEvent.layout.width)}
      style={[
        styles.bar,
        {
          bottom: barBottom(insets.bottom),
          backgroundColor: tk.navBg,
          borderColor: tk.navBorder,
          shadowColor: tk.dark ? '#000' : '#280A3C',
          shadowOpacity: tk.dark ? 0.55 : 0.2,
        },
      ]}
    >
      <Animated.View style={[styles.pill, { backgroundColor: tk.navPill }, pillStyle]} />

      {TABS.map((tab) => {
        const focused = !menuOpen && tab.name === activeName;
        return (
          <NavSlot
            key={tab.name}
            testID={`tab-${tab.name}`}
            label={tab.label}
            focused={focused}
            role="tab"
            tk={tk}
            onPress={() => onSelect(tab.name)}
          >
            <Icon name={tab.icon} color={focused ? tk.navActive : tk.navIdle} size={22} />
          </NavSlot>
        );
      })}

      {/* Account opens the menu rather than navigating, so it is a button —
          but it still takes the pill, which is what the mock shows. */}
      <NavSlot
        testID="tab-account"
        label="Account"
        focused={menuOpen}
        role="button"
        tk={tk}
        onPress={onAccount}
      >
        <LinearGradient
          colors={['#37003C', '#6A0060']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.avatar,
            { borderColor: menuOpen ? tk.navActive : 'transparent' },
          ]}
        >
          <Text style={styles.avatarText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {initials}
          </Text>
        </LinearGradient>
      </NavSlot>
    </View>
  );
}

function NavSlot({
  testID,
  label,
  focused,
  role,
  tk,
  onPress,
  children,
}: {
  testID: string;
  label: string;
  focused: boolean;
  role: 'tab' | 'button';
  tk: ApexTokens;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'tab' ? { selected: focused } : undefined}
      style={styles.slot}
      onPress={onPress}
    >
      {children}
      <Text
        style={[
          styles.label,
          {
            color: focused ? tk.navActive : tk.navIdle,
            fontFamily: focused ? 'Archivo_800ExtraBold' : 'Archivo_600SemiBold',
          },
        ]}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    // ponytail: translucent fill only, no backdrop blur. At the mock's 0.85/0.88
    // alpha the blur is barely visible, and expo-glass-effect (already a dep) is
    // iOS-26-only + needs a dev build. Swap it in here if the fill ever thins.
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: PAD_X,
    paddingVertical: PAD_Y,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  pill: {
    position: 'absolute',
    left: PAD_X,
    top: PILL_INSET,
    bottom: PILL_INSET,
    borderRadius: 999,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 3,
  },
  label: {
    fontSize: 10,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontFamily: 'Archivo_900Black',
    fontSize: 8.5,
  },
});
