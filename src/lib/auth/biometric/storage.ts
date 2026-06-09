import * as SecureStore from 'expo-secure-store';

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  user_id: string;
}

const SLOT = 'fpl_gaffer_biometric_session';

export async function saveSession(s: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SLOT, JSON.stringify(s));
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SLOT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.access_token !== 'string' ||
      typeof parsed?.refresh_token !== 'string' ||
      typeof parsed?.user_id !== 'string'
    ) {
      return null;
    }
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SLOT);
  } catch {
    /* swallow — clearing is best-effort */
  }
}
