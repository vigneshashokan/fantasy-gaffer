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

  if (session && status === 'complete' && !onResetPassword) {
    return <Redirect href="/(home)/(tabs)/team" />;
  }
  if (session && status === 'missing' && !onCompleteProfile && !onResetPassword) {
    return <Redirect href="/(onboarding)/complete-profile" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
