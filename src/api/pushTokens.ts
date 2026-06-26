// Token persistence for #36. Mirrors notificationPrefs.ts (the only place
// push_tokens is written). RLS scopes every row to auth.uid(), so delete-by-token
// only ever removes the current user's row for this device.
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export async function upsertPushToken(userId: string, token: string): Promise<void> {
  const platform = Platform.OS === 'android' ? 'android' : 'ios';
  const { error } = await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform, last_seen_at: new Date().toISOString() },
    { onConflict: 'user_id,token' },
  );
  if (error) throw error;
}

export async function deletePushToken(token: string): Promise<void> {
  const { error } = await supabase.from('push_tokens').delete().eq('token', token);
  if (error) throw error;
}
