// src/api/profile.ts
//
// useProfile() returns the current user's profile row joined with their
// auth email and the biometric-store faceId toggle.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useBiometricStore } from '@/store/biometricStore';
import { queryKeys } from './queryKeys';
import type { Profile } from '@/types/fpl';

interface ProfileRow {
  first_name: string;
  last_name: string;
  dob: string;
  fpl_team_id: number | null;
}

function formatDob(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'UTC',
  });
}

export function profileFromRow(row: ProfileRow, email: string, faceId: boolean): Profile {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    dob: formatDob(row.dob),
    gender: 'Prefer not to say',
    email,
    faceId,
    fplTeamId: row.fpl_team_id,
  };
}

export function useProfile() {
  const { enabled: faceIdEnabled } = useBiometricStore();
  return useQuery({
    queryKey: queryKeys.profile('current'),
    queryFn: async (): Promise<Profile> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userRes.user;
      if (!user) throw new Error('No authenticated user');

      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, dob, fpl_team_id')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return profileFromRow(data as ProfileRow, user.email ?? '', faceIdEnabled);
    },
    staleTime: Infinity,
  });
}
