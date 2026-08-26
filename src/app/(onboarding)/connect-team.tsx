// src/app/(onboarding)/connect-team.tsx
//
// Single screen, local state machine. The spec lists 7 states
// (idle / validating / invalid / fetch_error / confirming / linking /
// link_error). The implementation collapses to a 4-variant `Stage` type:
// validating / invalid / fetch_error are derived from the useTeamPreview
// hook's status, not stored separately. This avoids two sources of truth.
// Reachable from Complete Profile (after submit), from LinkTeamCta, and from
// the Profile sheet's FPL-team row with ?relink=1 (an already-linked team).

import { useLinkTeam } from '@/api/linkTeam';
import { useTeamPreview, type Preview } from '@/api/teamPreview';
import { ConfirmHero } from '@/components/connect-team/ConfirmHero';
import { ConfirmPitch } from '@/components/connect-team/ConfirmPitch';
import { TeamHelpSheet } from '@/components/connect-team/TeamHelpSheet';
import { TeamIdInput } from '@/components/connect-team/TeamIdInput';
import { apexTokens } from '@/constants/apexTokens';
import { getTheme } from '@/constants/theme';
import { PillBtn } from '@/components/ui/PillBtn';
import { useThemeStore } from '@/store/themeStore';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useA11yAnnounce } from '@/lib/a11y';

type Stage =
  | { kind: 'idle' }
  | { kind: 'submitted'; teamId: number }
  | { kind: 'confirming'; teamId: number; preview: Preview }
  | { kind: 'link_error'; teamId: number; preview: Preview; message: string };

export default function ConnectTeam() {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);
  const t = getTheme(paletteKey, dark);
  const insets = useSafeAreaInsets();

  // Reached from Profile when a team is already linked: the same flow, but a
  // switch rather than first-time setup, so there is nothing to "skip" — and
  // no home tab to land on if you back out.
  const relinking = useLocalSearchParams<{ relink?: string }>().relink === '1';

  const [teamIdStr, setTeamIdStr] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [helpOpen, setHelpOpen] = useState(false);

  // Pass the teamId when submitted; null otherwise (hook stays disabled).
  // Note: in tests the hook mock ignores the argument and returns whatever
  // mockReturnValue says, so errors/success set before rendering are visible
  // immediately via the hook even with null teamId.
  const teamIdForPreview = stage.kind === 'submitted' ? stage.teamId : null;
  const preview = useTeamPreview(teamIdForPreview);
  const link = useLinkTeam();

  // Transition submitted → confirming once the preview resolves.
  // Also handle the case where hook returns success before stage advances
  // (e.g. in tests that pre-set the mock to success state).
  useEffect(() => {
    if (preview.isSuccess && preview.data) {
      if (stage.kind === 'submitted') {
        setStage({ kind: 'confirming', teamId: stage.teamId, preview: preview.data });
      } else if (stage.kind === 'idle') {
        // Hook returned success even with null teamId (test scenario).
        setStage({ kind: 'confirming', teamId: 0, preview: preview.data });
      }
    }
  }, [stage.kind, preview.isSuccess, preview.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useA11yAnnounce(stage.kind === 'link_error' ? stage.message : null);

  const validInput = /^\d{1,10}$/.test(teamIdStr);

  // inputError: shown below the TeamIdInput for 4xx responses.
  // Visible whenever hook reports a 4xx error (stage can be idle or submitted).
  const previewErrorStatus = preview.isError
    ? (preview.error as { status?: number } | null)?.status
    : undefined;

  const inputError = (() => {
    if (!preview.isError) return undefined;
    if (previewErrorStatus === 404) return "We couldn't find a team with that ID.";
    if (previewErrorStatus && previewErrorStatus >= 400 && previewErrorStatus < 500) {
      return "That doesn't look like a valid FPL team ID.";
    }
    return undefined;
  })();

  // fetchErrored: network/server error (no status or 5xx).
  const fetchErrored =
    preview.isError &&
    (!previewErrorStatus || previewErrorStatus >= 500);

  const validating = preview.isLoading;

  const onContinue = () => {
    if (!validInput) return;
    setStage({ kind: 'submitted', teamId: Number(teamIdStr) });
  };

  const onDismiss = () =>
    relinking ? router.back() : router.replace('/(home)/(tabs)/team');

  const onLink = async () => {
    if (stage.kind !== 'confirming') return;
    try {
      await link.mutateAsync({ teamId: stage.teamId });
      router.replace('/(home)/(tabs)/team');
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't save — try again.";
      setStage({ kind: 'link_error', teamId: stage.teamId, preview: stage.preview, message });
    }
  };

  const onWrongTeam = () => {
    setStage({ kind: 'idle' });
  };

  const onRetryFetch = () => {
    if (!validInput) return;
    // Re-setting the identical stage was a no-op: React bails on unchanged
    // state, and the errored query has retry:false, so nothing re-ran until an
    // app-focus or reconnect event happened to refire it. Ask the query
    // directly (#178).
    setStage({ kind: 'submitted', teamId: Number(teamIdStr) });
    void preview.refetch();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tk.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 12,
            flexGrow: 1,
            // Center the input view vertically; the confirm view grows
            // past the viewport so justifyContent has no effect there.
            justifyContent: stage.kind === 'confirming' || stage.kind === 'link_error'
              ? 'flex-start'
              : 'center',
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {(stage.kind === 'idle' || stage.kind === 'submitted') && (
          <View style={styles.inputColumn}>
            <Text style={[styles.title, { color: tk.text, textAlign: 'center' }]}>
              {relinking ? 'Change your FPL team' : 'Connect your FPL team'}
            </Text>
            <Text style={[styles.subtitle, { color: tk.faint, textAlign: 'center' }]}>
              {relinking
                ? 'Paste the team ID you want to switch to.'
                : 'Paste your FPL team ID.'}
            </Text>
            <TeamIdInput
              value={teamIdStr}
              onChange={setTeamIdStr}
              onHelpPress={() => setHelpOpen(true)}
              error={inputError}
              disabled={validating}
              testID="team-id-input"
            />

            {fetchErrored && (
              <View style={[styles.fetchErrorCard, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
                <Text style={[styles.fetchErrorText, { color: tk.text }]}>
                  Couldn't reach FPL.
                </Text>
                <Pressable
                  onPress={onRetryFetch}
                  accessibilityRole="button"
                  // Secondary action inside the error card, so it stays a
                  // plain Pressable rather than the primary PillBtn — but the
                  // fill is a palette token now, not the classic violet.
                  style={[styles.retryBtn, { backgroundColor: tk.activeFill }]}
                >
                  <Text style={styles.retryBtnText}>Try again</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.actions}>
              <PillBtn
                testID="connect-team-submit"
                variant="accent"
                accentFill={t.accent}
                accentInk={t.accentInk}
                onPress={onContinue}
                disabled={!validInput || validating}
              >
                {validating ? (
                  <ActivityIndicator color={t.accentInk} />
                ) : (
                  'Continue'
                )}
              </PillBtn>
              <Pressable onPress={onDismiss} accessibilityRole="button" style={styles.ghostBtn}>
                <Text style={[styles.ghostBtnText, { color: tk.faint }]}>
                  {relinking ? 'Cancel' : 'Skip for now'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {(stage.kind === 'confirming' || stage.kind === 'link_error') && (
          <>
            <Text style={[styles.title, { color: tk.text }]}>Is this you?</Text>
            <ConfirmHero preview={stage.preview} />
            <Text style={[styles.label, { color: tk.faint }]}>YOUR XI</Text>
            <ConfirmPitch preview={stage.preview} />

            {stage.kind === 'link_error' && (
              <Text
                accessibilityLiveRegion="assertive"
                style={[styles.linkError, { color: tk.danger }]}
              >
                {stage.message}
              </Text>
            )}

            <View style={styles.actions}>
              <PillBtn
                testID="connect-team-confirm"
                variant="accent"
                accentFill={t.accent}
                accentInk={t.accentInk}
                onPress={onLink}
                disabled={link.isPending}
              >
                {link.isPending ? <ActivityIndicator color={t.accentInk} /> : 'Yes, link team'}
              </PillBtn>
              <Pressable onPress={onWrongTeam} accessibilityRole="button" style={styles.ghostBtn}>
                <Text style={[styles.ghostBtnText, { color: tk.faint }]}>Wrong team — go back</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <TeamHelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, gap: 14 },
  // Keeps the input view as a tight, balanced column so the field doesn't
  // look isolated next to full-width siblings. The confirm view doesn't
  // use this — its content is naturally wider.
  inputColumn: { width: '100%', maxWidth: 240, alignSelf: 'center', gap: 14 },
  title: { fontFamily: 'Archivo_800ExtraBold', fontSize: 24, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Archivo_500Medium', fontSize: 13.5 },
  label: { fontFamily: 'Archivo_700Bold', fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' },
  actions: { gap: 8, marginTop: 8 },
  ghostBtn: { paddingVertical: 11, alignItems: 'center' },
  ghostBtnText: { fontFamily: 'Archivo_700Bold', fontSize: 13 },
  fetchErrorCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  fetchErrorText: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
  retryBtn: { paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  retryBtnText: { fontFamily: 'Archivo_700Bold', fontSize: 13.5, color: '#fff' },
  linkError: { fontFamily: 'Archivo_500Medium', fontSize: 13 },
});
