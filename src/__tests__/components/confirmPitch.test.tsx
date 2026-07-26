// src/__tests__/components/confirmPitch.test.tsx
import { render } from '@testing-library/react-native';
import { ConfirmPitch } from '@/components/connect-team/ConfirmPitch';
import { apexTokens } from '@/constants/apexTokens';
import type { Preview, PreviewPlayer } from '@/api/teamPreview';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function p(name: string, club: 'ARS' | 'MCI' | 'MUN' | 'CHE' | 'TOT' | 'NEW' | 'AVL' | 'LIV' | 'BOU' | 'BRE' | 'CRY' | 'NFO', flags: Partial<PreviewPlayer> = {}): PreviewPlayer {
  return { name, club, ...flags };
}

const PREVIEW: Preview = {
  teamName: 'Apex Pitch FC',
  managerName: 'Vignesh A.',
  rank: 0, totalPoints: 0, captainName: 'Haaland',
  starters: [
    p('Raya', 'ARS'),
    p('Gabriel', 'ARS'),
    p('Trippier', 'NEW'),
    p('Senesi', 'BOU'),
    p('Doku', 'MCI'),
    p('B.Fernandes', 'MUN'),
    p('Saka', 'ARS', { vice: true }),
    p('Palmer', 'CHE'),
    p('Haaland', 'MCI', { capt: true }),
    p('Watkins', 'AVL'),
    p('Solanke', 'TOT'),
  ],
  bench: [
    p('Henderson', 'CRY'),
    p('Truffert', 'BOU'),
    p('O.Dango', 'BRE'),
    p('Lacroix', 'CRY'),
  ],
};

describe('<ConfirmPitch />', () => {
  it('renders every starter and bench name', () => {
    const { getByText } = render(<ConfirmPitch preview={PREVIEW} />);
    for (const player of [...PREVIEW.starters, ...PREVIEW.bench]) {
      expect(getByText(player.name)).toBeTruthy();
    }
  });

  it('renders the vice badge next to the vice captain', () => {
    const { getAllByText } = render(<ConfirmPitch preview={PREVIEW} />);
    expect(getAllByText('V').length).toBeGreaterThan(0);
  });

  // #173: the disc is reused on the pitch (always dark green) and on the bench
  // card (tk.card — WHITE in light mode). A hardcoded '#fff' name made every
  // bench player invisible in light mode.
  it('inks bench names against the bench card, not the pitch', () => {
    // themeStore defaults to the light classic palette.
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(<ConfirmPitch preview={PREVIEW} />);

    const flat = (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s.flat()) : s) as { color?: string };
    expect(flat(getByText('Haaland').props.style).color).toBe('#fff');
    expect(flat(getByText('Henderson').props.style).color).toBe(tk.text);
    expect(flat(getByText('Henderson').props.style).color).not.toBe('#fff');
  });

  it('handles partial squads (5 starters, 0 bench) without crashing', () => {
    const partial: Preview = {
      ...PREVIEW,
      starters: PREVIEW.starters.slice(0, 5),
      bench: [],
    };
    const { getByText } = render(<ConfirmPitch preview={partial} />);
    expect(getByText('Raya')).toBeTruthy();
  });
});
