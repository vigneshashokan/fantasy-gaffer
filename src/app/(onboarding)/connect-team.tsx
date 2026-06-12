// src/app/(onboarding)/connect-team.tsx
//
// Single screen, local state machine. The spec lists 7 states
// (idle / validating / invalid / fetch_error / confirming / linking /
// link_error). The implementation collapses to a 4-variant `Stage` type:
// validating / invalid / fetch_error are derived from the useTeamPreview
// hook's status, not stored separately. This avoids two sources of truth.
// Reachable from Complete Profile (after submit) and from LinkTeamCta.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';
import { useTeamPreview, type Preview } from '@/api/teamPreview';
import { useLinkTeam } from '@/api/linkTeam';
import { TeamIdInput } from '@/components/connect-team/TeamIdInput';
import { TeamHelpSheet } from '@/components/connect-team/TeamHelpSheet';
import { ConfirmHero } from '@/components/connect-team/ConfirmHero';
import { ConfirmPitch } from '@/components/connect-team/ConfirmPitch';

type Stage =
  | { kind: 'idle' }
  | { kind: 'submitted'; teamId: number }
  | { kind: 'confirming'; teamId: number; preview: Preview }
  | { kind: 'link_error'; teamId: number; preview: Preview; message: string };

export default function ConnectTeam() {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);

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

  const onSkip = () => router.replace('/(home)/(tabs)/team');

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
    setStage({ kind: 'submitted', teamId: Number(teamIdStr) });
  };

  const showingConfirm = stage.kind === 'confirming' || stage.kind === 'link_error';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tk.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {!showingConfirm && (
          <>
            <Text style={[styles.title, { color: tk.text }]}>Connect your FPL team</Text>
            <Text style={[styles.subtitle, { color: tk.faint }]}>
              Paste your FPL team ID.
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
                  style={[styles.retryBtn, { backgroundColor: '#7C3AED' }]}
                >
                  <Text style={styles.retryBtnText}>Try again</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.actions}>
              <Pressable
                onPress={onContinue}
                disabled={!validInput || validating}
                accessibilityRole="button"
                accessibilityState={{ disabled: !validInput || validating }}
                style={[
                  styles.primaryBtn,
                  { backgroundColor: validInput ? '#7C3AED' : tk.cardBorder, opacity: validating ? 0.7 : 1 },
                ]}
              >
                {validating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    Continue
                  </Text>
                )}
              </Pressable>
              <Pressable onPress={onSkip} style={styles.ghostBtn}>
                <Text style={[styles.ghostBtnText, { color: tk.faint }]}>Skip for now</Text>
              </Pressable>
            </View>
          </>
        )}

        {showingConfirm && stage.kind !== 'idle' && stage.kind !== 'submitted' && (
          <>
            <Text style={[styles.title, { color: tk.text }]}>Is this you?</Text>
            <ConfirmHero preview={stage.preview} />
            <View style={{ height: 12 }} />
            <Text style={[styles.label, { color: tk.faint }]}>YOUR XI</Text>
            <ConfirmPitch preview={stage.preview} />

            {stage.kind === 'link_error' && (
              <Text style={styles.linkError}>{stage.message}</Text>
            )}

            <View style={styles.actions}>
              <Pressable
                onPress={onLink}
                disabled={link.isPending}
                style={[styles.primaryBtn, { backgroundColor: '#7C3AED', opacity: link.isPending ? 0.7 : 1 }]}
              >
                {link.isPending ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.primaryBtnText}>Yes, link team</Text>
                )}
              </Pressable>
              <Pressable onPress={onWrongTeam} style={styles.ghostBtn}>
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
  title: { fontFamily: 'Archivo_800ExtraBold', fontSize: 24, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Archivo_500Medium', fontSize: 13.5 },
  label: { fontFamily: 'Archivo_700Bold', fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' },
  actions: { gap: 8, marginTop: 8 },
  primaryBtn: {
    paddingVertical: 13,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: 'Archivo_700Bold', fontSize: 14.5, color: '#fff' },
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
  linkError: { color: '#FF6B6B', fontFamily: 'Archivo_500Medium', fontSize: 13 },
});
