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
        {/* A form sheet rather than a plain modal, so iOS draws the grabber
            that replaced the screen's back button. One 1.0 detent for the same
            reason as the player sheet below. */}
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 26,
          }}
        />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        {/* Player details is a bottom sheet: it rises from the bottom edge and
            settles at full height, so the content reads as a page rather than
            a floating card. The grabber + drag-down ARE the dismiss affordance
            — the screen deliberately draws no back button.

            The single 1.0 detent is what takes it to the top; the mock caps
            its sheet at 0.82, so this is a deliberate deviation. Adding 0.82
            back as a FIRST detent would open it part-height and let a drag
            expand it — not what we want here. */}
        <Stack.Screen
          name="player/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 26,
          }}
        />
        <Stack.Screen name="transfer-targets/[id]" />
      </Stack>
      <PushOrchestrator />
    </>
  );
}
