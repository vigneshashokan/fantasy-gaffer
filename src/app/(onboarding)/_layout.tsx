import React from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useProfileGate } from '@/lib/useProfileGate';

export default function OnboardingLayout() {
  const session = useAuthStore((s) => s.session);
  const { status } = useProfileGate();
  const segments = useSegments();
  const onCompleteProfile = segments[segments.length - 1] === 'complete-profile';
  const onResetPassword = segments[segments.length - 1] === 'reset-password';
  const onRestoreAccount = segments[segments.length - 1] === 'restore-account';
  // connect-team is an opt-in destination reached either from the CTA on
  // the Team tab (status === 'complete') or from the just-after-signup
  // handoff in complete-profile (status === 'missing' until the gate
  // refetches). Whitelist it from both redirects; pending_deletion still
  // wins because a deleted account should not link a team.
  const onConnectTeam = segments[segments.length - 1] === 'connect-team';

  // Every redirect below is opt-IN on a resolved status, so 'loading' and
  // 'error' fall through to the plain <Stack>. That is deliberate: an
  // unresolved gate must never push the user anywhere (see #170).
  // pending_deletion wins; check it first.
  if (session && status === 'pending_deletion' && !onRestoreAccount) {
    return <Redirect href="/(onboarding)/restore-account" />;
  }
  if (session && status === 'complete' && !onResetPassword && !onConnectTeam) {
    return <Redirect href="/(home)/(tabs)/team" />;
  }
  if (session && status === 'missing' && !onCompleteProfile && !onResetPassword && !onConnectTeam) {
    return <Redirect href="/(onboarding)/complete-profile" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
