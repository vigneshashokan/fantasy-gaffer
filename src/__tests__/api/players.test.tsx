// src/__tests__/api/players.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { playersFromRows, useTopPicks } from '@/api/players';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '@/lib/supabase';

const FIXTURE_ROWS = [
  {
    id: 401, web_name: 'Haaland', team_id: 13,
    position: 'FWD', now_cost: 142, form: '8.4',
    total_points: 175, selected_by_percent: '62.3', ep_next: '9.1',
    status: 'a', news: '', chance_of_playing_next_round: null,
    ict_index: '312.4', bps: 640,
  },
  {
    id: 233, web_name: 'Saka', team_id: 1,
    position: 'MID', now_cost: 92, form: '6.1',
    total_points: 131, selected_by_percent: '38.6', ep_next: '7.2',
    status: 'a', news: '', chance_of_playing_next_round: null,
    ict_index: '288.1', bps: 510,
  },
];

const FIXTURE_CLUB_BY_ID: Record<number, string> = { 1: 'ARS', 13: 'MCI' };

describe('playersFromRows adapter', () => {
  it('maps DB columns to UI Player shape', () => {
    const result = playersFromRows(FIXTURE_ROWS, FIXTURE_CLUB_BY_ID);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: '401',
      name: 'Haaland',
      pos: 'FWD',
      club: 'MCI',
      p: 14.2,
      f: 8.4,
      tp: 175,
      own: 62.3,
      gw: 9.1,
      status: 'a',
      news: '',
      chanceNext: null,
      ict: 312.4,
      bps: 640,
    });
  });

  it('drops players whose club id is missing from the lookup', () => {
    const result = playersFromRows(FIXTURE_ROWS, { 1: 'ARS' });
    expect(result.map((p) => p.name)).toEqual(['Saka']);
  });

  it('handles parseFloat-failing strings by treating them as 0', () => {
    const result = playersFromRows(
      [{ ...FIXTURE_ROWS[0], form: '', selected_by_percent: '', ep_next: '' }],
      FIXTURE_CLUB_BY_ID,
    );
    expect(result[0].f).toBe(0);
    expect(result[0].own).toBe(0);
    expect(result[0].gw).toBe(0);
  });
});

describe('useTopPicks', () => {
  it('groups players by position and sorts by gw (ep_next) desc, top 8 per pos', async () => {
    const manyFwds = Array.from({ length: 10 }, (_, i) => ({
      id: 500 + i,
      web_name: `Fwd${i}`,
      team_id: 13,
      position: 'FWD' as const,
      now_cost: 60, form: '5.0',
      total_points: 50, selected_by_percent: '5.0',
      ep_next: String(10 - i),
    }));
    const playersRow = jest.fn().mockResolvedValue({ data: manyFwds, error: null });
    const clubsRow   = jest.fn().mockResolvedValue({
      data: [{ id: 13, short_name: 'MCI', name: 'Man City' }],
      error: null,
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) => ({
      select: table === 'players' ? playersRow : clubsRow,
    }));

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTopPicks(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.FWD).toHaveLength(8);
    expect(result.current.data?.FWD[0].name).toBe('Fwd0'); // ep_next=10
    expect(result.current.data?.FWD[7].name).toBe('Fwd7'); // ep_next=3
  });
});
