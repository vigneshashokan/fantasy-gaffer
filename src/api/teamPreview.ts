// src/api/teamPreview.ts
//
// useTeamPreview composes the two FPL endpoints needed by the connect-team
// confirm view: /entry/{id}/ for manager info, /event/{gw}/picks/ for the 15
// player IDs. Joined against the existing players cache for names + clubs.
// staleTime/gcTime are 0 — every Continue tap is observably fresh, and
// failed attempts shouldn't sit in the cache.

import { useQuery } from '@tanstack/react-query';
import { fplGet, FplFetchError } from './fpl-client';
import { useCurrentGameweek } from './fixtures';
import { usePlayers } from './players';
import type { ClubCode, Player } from '@/types/fpl';

interface FplEntry {
  id: number;
  name: string;
  player_first_name: string;
  player_last_name: string;
  summary_overall_rank: number;
  summary_overall_points: number;
}

interface PicksResponse {
  picks: Array<{
    element: number;
    position: number;
    is_captain: boolean;
    is_vice_captain: boolean;
    multiplier: number;
  }>;
}

export interface PreviewPlayer {
  name: string;
  club: ClubCode;
  capt?: boolean;
  vice?: boolean;
}

export interface Preview {
  teamName: string;
  managerName: string;
  rank: number;
  totalPoints: number;
  captainName: string;
  starters: PreviewPlayer[];
  bench: PreviewPlayer[];
}

export function composePreview(
  entry: FplEntry,
  picks: PicksResponse,
  players: Player[],
): Preview {
  const byId = new Map(players.map((p) => [p.id, p]));
  const starters: PreviewPlayer[] = [];
  const bench: PreviewPlayer[] = [];
  let captainName = '';

  for (const pick of picks.picks) {
    const base = byId.get(String(pick.element));
    if (!base) continue;
    const enriched: PreviewPlayer = {
      name: base.name,
      club: base.club,
      capt: pick.is_captain || undefined,
      vice: pick.is_vice_captain || undefined,
    };
    if (pick.position <= 11) starters.push(enriched);
    else bench.push(enriched);
    if (pick.is_captain) captainName = base.name;
  }

  return {
    teamName: entry.name,
    managerName: `${entry.player_first_name} ${entry.player_last_name}`.trim(),
    rank: entry.summary_overall_rank,
    totalPoints: entry.summary_overall_points,
    captainName,
    starters,
    bench,
  };
}

export function useTeamPreview(teamId: number | null) {
  const players = usePlayers();
  const currentGw = useCurrentGameweek();
  const gw = currentGw.data ?? null;
  const playersReady = Array.isArray(players.data);

  return useQuery<Preview, FplFetchError>({
    queryKey: ['teamPreview', teamId, gw],
    queryFn: async () => {
      const [entry, picks] = await Promise.all([
        fplGet<FplEntry>(`/entry/${teamId}/`),
        fplGet<PicksResponse>(`/entry/${teamId}/event/${gw}/picks/`),
      ]);
      return composePreview(entry, picks, players.data ?? []);
    },
    enabled: teamId != null && gw != null && playersReady,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
