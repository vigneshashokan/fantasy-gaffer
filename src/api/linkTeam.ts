// src/api/linkTeam.ts
//
// The only mutation in #22. Writes profiles.fpl_team_id for the current
// user and invalidates the profile cache so useProfile() refetches.
// Squad / manager / chips queries are gated on fplTeamId — they re-enable
// automatically once profile updates.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from './queryKeys';

interface PostgrestErrorShape {
  message: string;
  code?: string;
}

export function useLinkTeam() {
  const qc = useQueryClient();
  return useMutation<void, PostgrestErrorShape, { teamId: number }>({
    mutationFn: async ({ teamId }) => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr as PostgrestErrorShape;
      const userId = userRes.user?.id;
      if (!userId) throw new Error('No authenticated user') as unknown as PostgrestErrorShape;

      const { error } = await supabase
        .from('profiles')
        .update({ fpl_team_id: teamId, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error as PostgrestErrorShape;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profile('current') });
    },
  });
}
