// src/lib/external.ts
//
// Platform handoffs for the Settings "More" rows. Kept behind thin
// functions so screens stay declarative and the platform calls are
// unit-testable behind mocks. Sharing a URL/text is RN Share's job —
// expo-sharing is for local files only, so it is intentionally not used.

import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { APP_STORE_URL, FEEDBACK_EMAIL, FPL_MY_TEAM_URL } from '@/constants/links';

export async function shareApp(): Promise<void> {
  // User-cancel resolves normally (action === 'dismissedAction'); not an error.
  await Share.share({
    message: `Check out Fantasy Gaffer — your FPL season, leveled up. ${APP_STORE_URL}`,
    url: APP_STORE_URL, // iOS uses url; Android folds it into message.
  });
}

// Hands off to the official FPL app/site so a saved plan can actually be
// applied. Opens the installed FPL app when it claims the URL, the browser
// otherwise. Swallows the rejection openURL throws when nothing can handle it —
// there is no useful recovery, and the plan is still on screen.
export async function openFplTeam(): Promise<void> {
  await Linking.openURL(FPL_MY_TEAM_URL).catch(() => {});
}

export async function sendFeedback(): Promise<{ ok: boolean }> {
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Fantasy Gaffer feedback')}`;
  const can = await Linking.canOpenURL(url);
  if (!can) return { ok: false }; // caller shows a fallback Alert
  await Linking.openURL(url);
  return { ok: true };
}
