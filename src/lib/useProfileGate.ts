// src/lib/useProfileGate.ts
//
// Resolves a session into the onboarding verdict the route groups branch on.
//
// This runs on TanStack Query rather than a hand-rolled effect because the
// gate has to survive a failed read, and Query already owns that behaviour:
// retry, pause-while-offline (see @/lib/query/onlineManager), automatic
// refetch on reconnect, and — via the persisted cache (#39) — a last-known
// verdict restored on a cold start, so a returning user who is offline lands
// on their cached team instead of a blank screen.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/api/queryKeys';

export type ProfileStatus =
  | 'loading'
  | 'error'
  | 'pending_deletion'
  | 'missing'
  | 'complete';

/** The verdicts a *successful* read can produce. 'loading'/'error' are states of the read itself. */
type Verdict = Extract<ProfileStatus, 'pending_deletion' | 'missing' | 'complete'>;

export function useProfileGate(): { status: ProfileStatus; refetch: () => void } {
  // Subscribe to the user id, not the session OBJECT: auth-js constructs a
  // fresh Session for every TOKEN_REFRESHED (~hourly) and authStore `set`s
  // it, which used to unmount the whole home navigator (#171).
  const userId = useAuthStore((s) => s.session?.user.id);
  const hydrated = useAuthStore((s) => s.hydrated);

  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.profileGate(userId ?? 'anon'),
    enabled: hydrated && !!userId,
    queryFn: async (): Promise<Verdict> => {
      const [profile, deletion] = await Promise.all([
        supabase.from('profiles').select('user_id').eq('user_id', userId!).maybeSingle(),
        supabase
          .from('account_deletions')
          .select('user_id')
          .eq('user_id', userId!)
          .maybeSingle(),
      ]);

      // A PostgREST query without .throwOnError() NEVER rejects — a network
      // failure resolves as { data: null, error }. Reading `data` without
      // checking `error` therefore reported "row absent" for every failed
      // read, which (a) routed a perfectly valid registered user into the
      // complete-profile onboarding flow and (b) let a pending-deletion
      // account slip past the restore gate whenever that one query hiccuped
      // (#170). Throw instead, so an unresolved gate is 'error', never a
      // verdict; only `data === null` with `error === null` means "no row".
      if (deletion.error) throw deletion.error;
      if (deletion.data) return 'pending_deletion'; // wins over both other states
      if (profile.error) throw profile.error;
      return profile.data ? 'complete' : 'missing';
    },
  });

  // A failed refetch keeps the previous verdict (Query retains `data`), so a
  // transient blip never demotes a resolved user back to an unknown state.
  return { status: data ?? (isError ? 'error' : 'loading'), refetch: () => void refetch() };
}
