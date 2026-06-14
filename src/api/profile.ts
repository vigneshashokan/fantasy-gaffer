// src/api/profile.ts
//
// useProfile() returns the current user's profile row joined with the
// session's email and the biometric-store faceId toggle.
//
// Cache key is scoped by auth user id so two accounts on the same device
// don't share a cache entry. Combined with the global QueryClient clear
// in AuthCacheClear (on SIGNED_IN/OUT/USER_UPDATED), this prevents any
// cross-account data leak via TanStack's cache.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useBiometricStore } from '@/store/biometricStore';
import { useAuthStore } from '@/store/authStore';
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
    email,
    faceId,
    fplTeamId: row.fpl_team_id,
  };
}

export function useProfile() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const userEmail = useAuthStore((s) => s.session?.user.email);
  const { enabled: faceIdEnabled } = useBiometricStore();

  return useQuery({
    queryKey: queryKeys.profile(userId ?? 'anon'),
    enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, dob, fpl_team_id')
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return profileFromRow(data as ProfileRow, userEmail ?? '', faceIdEnabled);
    },
    staleTime: Infinity,
  });
}
