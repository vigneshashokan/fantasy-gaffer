// Shared "couldn't load this" surface (#167).
//
// Every data screen used to run its pending branch before its error branch —
// and TanStack leaves `data` undefined on error with `isPending` false, so the
// skeleton branch won forever: a cold start with FPL down pulsed a skeleton
// with no message and no way out. Screens now check `isError && !data` FIRST
// and render this, with a Retry wired to the hook's own `refetch`.
//
// Modelled on player/[id].tsx's SummaryError — the one screen that already got
// this right — promoted to a shared component so the six other screens don't
// each grow their own copy.
import React from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import { MAX_FONT_SCALE, useA11yAnnounce } from '@/lib/a11y';

interface ErrorStateProps {
  tk: ApexTokens;
  onRetry: () => void;
  title?: string;
  message?: string;
  // Screens inside a paged carousel need explicit page dimensions instead of
  // `flex: 1` (see GameweekScreen).
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ErrorState({
  tk,
  onRetry,
  title = "Couldn't load your data",
  message = "We couldn't reach the game right now. Check your connection and try again.",
  style,
  testID = 'error-state',
}: ErrorStateProps) {
  useA11yAnnounce(`${title}. ${message}`);

  return (
    <View
      testID={testID}
      accessibilityLiveRegion="assertive"
      style={[styles.fill, { backgroundColor: tk.bg }, style]}
    >
      <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
        <Text style={[styles.title, { color: tk.text }]}>{title}</Text>
        <Text style={[styles.body, { color: tk.faint }]}>{message}</Text>
        <Pressable
          testID={`${testID}-retry`}
          onPress={onRetry}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: tk.activeFill, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.btnText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Retry
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 17,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  btn: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#fff',
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 14.5,
  },
});
