// src/api/linkTeam.ts
//
// The only mutation in #22. Writes profiles.fpl_team_id for the current
// user and invalidates the user-scoped profile cache so useProfile()
// refetches. Squad / manager / chips queries are gated on fplTeamId —
// they re-enable automatically once profile updates.
//
// User id comes from useAuthStore so the queryKey we invalidate matches
// the user-scoped key useProfile reads from. Invalidating a static
// `queryKeys.profile('current')` key (the original implementation) was
// a no-op after #83 changed useProfile to scope its key by user.id —
// the cache entry under ['profile', userId] never got marked stale, so
// the Team tab stayed on its empty state even after the DB row updated.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from './queryKeys';
import { track } from '@/lib/analytics';

interface PostgrestErrorShape {
  message: string;
  code?: string;
}

export function useLinkTeam() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);

  return useMutation<void, PostgrestErrorShape, { teamId: number }>({
    mutationFn: async ({ teamId }) => {
      if (!userId) {
        throw new Error('No authenticated user') as unknown as PostgrestErrorShape;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ fpl_team_id: teamId, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error as PostgrestErrorShape;
    },
    onSuccess: () => {
      track('squad_imported', { via: 'team_id' });
      if (!userId) return;
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
  });
}
