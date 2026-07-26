import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useProfileGate } from '@/lib/useProfileGate';
import { PushOrchestrator } from '@/components/notifications/PushOrchestrator';

export default function HomeStackLayout() {
  const session = useAuthStore((s) => s.session);
  const { status } = useProfileGate();

  if (!session) return <Redirect href="/(onboarding)/signin" />;
  if (status === 'pending_deletion') {
    return <Redirect href="/(onboarding)/restore-account" />;
  }
  // 'error' means we could not read the gate at all — NOT that the rows are
  // absent. Hold here rather than redirect: sending an unresolved user to
  // complete-profile was the #170 bug, and proceeding would let a
  // pending-deletion account past the restore gate. The hold is not a dead
  // end — useProfileGate retries, resumes when connectivity returns, and a
  // returning user's last verdict is restored from the persisted cache.
  if (status === 'loading' || status === 'error') return null;
  if (status === 'missing') return <Redirect href="/(onboarding)/complete-profile" />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="player/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="transfer-targets/[id]" />
      </Stack>
      <PushOrchestrator />
    </>
  );
}
