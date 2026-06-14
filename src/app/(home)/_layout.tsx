import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useProfileGate } from '@/lib/useProfileGate';

export default function HomeStackLayout() {
  const session = useAuthStore((s) => s.session);
  const { status } = useProfileGate();

  if (!session) return <Redirect href="/(onboarding)/signin" />;
  if (status === 'pending_deletion') {
    return <Redirect href="/(onboarding)/restore-account" />;
  }
  if (status === 'loading') return null;
  if (status === 'missing') return <Redirect href="/(onboarding)/complete-profile" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      <Stack.Screen name="player/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
