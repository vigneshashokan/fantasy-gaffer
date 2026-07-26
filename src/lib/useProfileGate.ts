import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export type ProfileStatus = 'loading' | 'pending_deletion' | 'missing' | 'complete';

export function useProfileGate(): { status: ProfileStatus; refetch: () => void } {
  // Subscribe to the user id, not the session OBJECT. authStore does
  // `set({ session })` on every auth event, and auth-js hands it a
  // freshly-constructed Session on every TOKEN_REFRESHED (~hourly, JWT
  // default 1h). Depending on that object identity re-ran this effect,
  // reset the status to 'loading', and made (home)/_layout render null —
  // unmounting the whole home navigator mid-session: blank UI, back to the
  // Team tab, open modals and scroll positions lost (#171). The user id is
  // a string, so a refresh for the same user is now a no-op.
  const userId = useAuthStore((s) => s.session?.user.id);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (!userId) {
      setStatus('loading');
      return;
    }
    setStatus('loading');

    let cancelled = false;

    Promise.all([
      supabase.from('profiles').select('user_id').eq('user_id', userId).maybeSingle(),
      supabase.from('account_deletions').select('user_id').eq('user_id', userId).maybeSingle(),
    ])
      .then(([profile, deletion]) => {
        if (cancelled) return;
        // pending_deletion wins over both other states.
        if (deletion.data) {
          setStatus('pending_deletion');
          return;
        }
        setStatus(profile.data ? 'complete' : 'missing');
      })
      .catch(() => {
        // If either query throws (e.g. network error), leave status as
        // 'loading' so the gate stays in its safe default state.
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, userId, tick]);

  return { status, refetch: () => setTick((t) => t + 1) };
}
