// src/__tests__/api/profile.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { profileFromRow, useProfile } from '@/api/profile';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
}));
jest.mock('@/store/biometricStore', () => ({
  useBiometricStore: () => ({ enabled: true }),
}));

import { supabase } from '@/lib/supabase';

describe('profileFromRow', () => {
  it('maps DB columns to Profile shape with faceId from biometric store', () => {
    const row = {
      first_name: 'Apex', last_name: 'Gaffer',
      dob: '1990-08-14',
      fpl_team_id: 12345,
    };
    const result = profileFromRow(row, 'apex@example.com', true);
    expect(result).toEqual({
      firstName: 'Apex',
      lastName: 'Gaffer',
      dob: '14 Aug 1990',
      gender: 'Prefer not to say',
      email: 'apex@example.com',
      faceId: true,
      fplTeamId: 12345,
    });
  });

  it('returns null fplTeamId when DB column is null', () => {
    const row = {
      first_name: 'A', last_name: 'B', dob: '2000-01-01', fpl_team_id: null,
    };
    expect(profileFromRow(row, 'x@y.com', false).fplTeamId).toBeNull();
  });
});

describe('useProfile', () => {
  it('fetches the row for the current user', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1', email: 'apex@example.com' } },
      error: null,
    });
    const single = jest.fn().mockResolvedValue({
      data: { first_name: 'Apex', last_name: 'Gaffer', dob: '1990-08-14', fpl_team_id: null },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ single }),
      }),
    });

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.firstName).toBe('Apex');
    expect(result.current.data?.email).toBe('apex@example.com');
  });
});
