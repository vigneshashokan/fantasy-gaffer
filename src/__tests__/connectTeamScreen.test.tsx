// src/__tests__/connectTeamScreen.test.tsx
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './utils/renderWithProviders';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/api/teamPreview', () => ({
  useTeamPreview: jest.fn(),
}));
jest.mock('@/api/linkTeam', () => ({
  useLinkTeam: jest.fn(),
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
}));

import ConnectTeam from '@/app/(onboarding)/connect-team';
import { useTeamPreview } from '@/api/teamPreview';
import { useLinkTeam } from '@/api/linkTeam';

const PREVIEW = {
  teamName: 'Apex Pitch FC',
  managerName: 'Vignesh A.',
  rank: 142831,
  totalPoints: 1452,
  captainName: 'Haaland',
  starters: Array.from({ length: 11 }, (_, i) => ({ name: `P${i}`, club: 'ARS' as const })),
  bench: Array.from({ length: 4 }, (_, i) => ({ name: `B${i}`, club: 'CRY' as const })),
};

function setHook(state: 'idle' | 'loading' | 'success' | 'error_404' | 'error_500') {
  switch (state) {
    case 'idle':
      (useTeamPreview as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null, isSuccess: false, fetchStatus: 'idle' });
      break;
    case 'loading':
      (useTeamPreview as jest.Mock).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null, isSuccess: false, fetchStatus: 'fetching' });
      break;
    case 'success':
      (useTeamPreview as jest.Mock).mockReturnValue({ data: PREVIEW, isLoading: false, isError: false, error: null, isSuccess: true, fetchStatus: 'idle' });
      break;
    case 'error_404':
      (useTeamPreview as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status: 404 }, isSuccess: false, fetchStatus: 'idle' });
      break;
    case 'error_500':
      (useTeamPreview as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status: 503 }, isSuccess: false, fetchStatus: 'idle' });
      break;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  (useLinkTeam as jest.Mock).mockReturnValue({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  });
});

describe('<ConnectTeam />', () => {
  it('Continue stays disabled until input is digits', () => {
    setHook('idle');
    const { getByRole } = renderWithProviders(<ConnectTeam />);
    const continueBtn = getByRole('button', { name: 'Continue' });
    expect(continueBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('shows the confirm view when preview succeeds', async () => {
    setHook('idle');
    const { getByText, getByTestId, rerender } = renderWithProviders(<ConnectTeam />);
    fireEvent.changeText(getByTestId('team-id-input'), '12345');
    setHook('success');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText('Apex Pitch FC')).toBeTruthy());
    expect(getByText('Yes, link team')).toBeTruthy();
  });

  it('Skip routes to the team tab', () => {
    setHook('idle');
    const { getByText } = renderWithProviders(<ConnectTeam />);
    fireEvent.press(getByText('Skip for now'));
    expect(mockReplace).toHaveBeenCalledWith('/(home)/(tabs)/team');
  });

  it('shows an invalid error when preview returns 404', () => {
    setHook('error_404');
    const { getByText, queryByText } = renderWithProviders(<ConnectTeam />);
    expect(getByText(/couldn't find a team/i)).toBeTruthy();
    expect(queryByText('Yes, link team')).toBeNull();
  });

  it('shows the fetch-error retry card on 5xx', () => {
    setHook('error_500');
    const { getByText } = renderWithProviders(<ConnectTeam />);
    expect(getByText(/Couldn't reach FPL/i)).toBeTruthy();
    expect(getByText('Try again')).toBeTruthy();
  });

  it('links the team and routes to /team on success', async () => {
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    (useLinkTeam as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    setHook('success');

    const { getByText } = renderWithProviders(<ConnectTeam />);
    fireEvent.press(getByText('Yes, link team'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(home)/(tabs)/team'));
  });
});
