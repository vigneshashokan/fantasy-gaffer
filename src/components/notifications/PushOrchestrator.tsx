import React, { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';
import { useAuthStore } from '@/store/authStore';
import { usePushStore } from '@/store/pushStore';
import { usePushTokenSync } from '@/lib/notifications/usePushTokenSync';
import { runPrimingEnable } from '@/lib/notifications/priming';
import { PushPrimingSheet } from '@/components/notifications/PushPrimingSheet';

// Mounted only in the authed + profile-complete (home) layout. Drives the
// one-shot soft-ask and the silent launch re-sync.
export function PushOrchestrator() {
  usePushTokenSync();
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);
  const userId = useAuthStore((s) => s.session?.user.id);
  const hydrated = usePushStore((s) => s.hydrated);
  const primingShown = usePushStore((s) => s.primingShown);
  const setPrimingShown = usePushStore((s) => s.setPrimingShown);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hydrated || primingShown) return;
    let cancelled = false;
    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (cancelled) return;
      if (status === 'undetermined' && canAskAgain) setVisible(true);
      else setPrimingShown(); // already granted or permanently denied — never prime
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, primingShown, setPrimingShown]);

  const onEnable = async () => {
    setVisible(false);
    setPrimingShown();
    await runPrimingEnable(userId);
  };
  const onLater = () => {
    setVisible(false);
    setPrimingShown();
  };

  return <PushPrimingSheet visible={visible} onEnable={onEnable} onLater={onLater} tk={tk} />;
}
