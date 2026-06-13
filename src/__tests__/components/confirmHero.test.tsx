// src/__tests__/components/confirmHero.test.tsx
import { render } from '@testing-library/react-native';
import { ConfirmHero } from '@/components/connect-team/ConfirmHero';
import type { Preview } from '@/api/teamPreview';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const PREVIEW: Preview = {
  teamName: 'Apex Pitch FC',
  managerName: 'Vignesh A.',
  rank: 142831,
  totalPoints: 1452,
  captainName: 'Haaland',
  starters: [],
  bench: [],
};

describe('<ConfirmHero />', () => {
  it('renders team name and manager name', () => {
    const { getByText } = render(<ConfirmHero preview={PREVIEW} />);
    expect(getByText('Apex Pitch FC')).toBeTruthy();
    expect(getByText('Vignesh A.')).toBeTruthy();
  });

  it('shows an em-dash when manager name is missing', () => {
    const { getByText } = render(
      <ConfirmHero preview={{ ...PREVIEW, managerName: '' }} />,
    );
    expect(getByText('—')).toBeTruthy();
  });

  it('does not render rank, total points, or captain', () => {
    const { queryByText } = render(<ConfirmHero preview={PREVIEW} />);
    expect(queryByText('142,831')).toBeNull();
    expect(queryByText('1,452')).toBeNull();
    expect(queryByText('Haaland')).toBeNull();
    expect(queryByText('Rank')).toBeNull();
    expect(queryByText('Total pts')).toBeNull();
    expect(queryByText('Captain')).toBeNull();
  });
});
