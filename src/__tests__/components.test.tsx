import React from 'react';
import { render } from '@testing-library/react-native';
import { Icon } from '@/components/ui/Icon';
import { PosTag } from '@/components/ui/PosTag';
import { PillBtn } from '@/components/ui/PillBtn';
import { Kit } from '@/components/ui/Kit';
import { PlayerToken } from '@/components/ui/PlayerToken';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PitchMarks } from '@/components/pitch/PitchMarks';
import { ApexPitchMarks } from '@/components/pitch/ApexPitchMarks';
import { Pitch } from '@/components/pitch/Pitch';
import { ApexPitch } from '@/components/pitch/ApexPitch';

// ── Icon ──────────────────────────────────────────────────────
describe('Icon', () => {
  it('renders chevL without crashing', () => {
    const { toJSON } = render(<Icon name="chevL" color="#fff" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders check without crashing', () => {
    const { toJSON } = render(<Icon name="check" color="#00E478" size={24} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders google without crashing', () => {
    const { toJSON } = render(<Icon name="google" size={24} />);
    expect(toJSON()).toBeTruthy();
  });
});

// ── PosTag ────────────────────────────────────────────────────
describe('PosTag', () => {
  it('renders GKP with correct label', () => {
    const { getByText } = render(<PosTag pos="GKP" />);
    expect(getByText('GKP')).toBeTruthy();
  });

  it('renders DEF', () => {
    const { getByText } = render(<PosTag pos="DEF" />);
    expect(getByText('DEF')).toBeTruthy();
  });

  it('renders MID', () => {
    const { getByText } = render(<PosTag pos="MID" />);
    expect(getByText('MID')).toBeTruthy();
  });

  it('renders FWD', () => {
    const { getByText } = render(<PosTag pos="FWD" />);
    expect(getByText('FWD')).toBeTruthy();
  });
});

// ── PillBtn ───────────────────────────────────────────────────
describe('PillBtn', () => {
  it('renders solid variant', () => {
    const { getByText } = render(<PillBtn onPress={() => {}}>Sign In</PillBtn>);
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('renders ghost variant', () => {
    const { getByText } = render(<PillBtn variant="ghost" onPress={() => {}}>Skip</PillBtn>);
    expect(getByText('Skip')).toBeTruthy();
  });

  it('renders accent variant', () => {
    const { getByText } = render(<PillBtn variant="accent" onPress={() => {}}>Continue</PillBtn>);
    expect(getByText('Continue')).toBeTruthy();
  });

  it('renders outline variant', () => {
    const { getByText } = render(<PillBtn variant="outline" onPress={() => {}}>Cancel</PillBtn>);
    expect(getByText('Cancel')).toBeTruthy();
  });
});

// ── Kit ───────────────────────────────────────────────────────
describe('Kit', () => {
  it('renders fallback circle for unknown club', () => {
    const { toJSON } = render(<Kit club="XYZ" size={46} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with capt badge', () => {
    const { getByText } = render(<Kit club="MCI" size={46} capt />);
    expect(getByText('C')).toBeTruthy();
  });

  it('renders with vice badge', () => {
    const { getByText } = render(<Kit club="ARS" size={46} vice />);
    expect(getByText('V')).toBeTruthy();
  });
});

// ── PlayerToken ───────────────────────────────────────────────
import type { Player } from '@/constants/data';

const mockPlayer: Player = {
  id: 'p1', name: 'Haaland', club: 'MCI', pos: 'FWD',
  gw: 12, p: 15.0, f: 9.1, tp: 175, own: 62.3, capt: false, vice: false,
};

describe('PlayerToken', () => {
  it('renders player name', () => {
    const { getByText } = render(<PlayerToken pl={mockPlayer} />);
    expect(getByText('Haaland')).toBeTruthy();
  });

  it('shows price when showStat=price', () => {
    const { getByText } = render(<PlayerToken pl={mockPlayer} showStat="price" />);
    expect(getByText('£15.0')).toBeTruthy();
  });

  it('shows doubled points for captain', () => {
    const { getByText } = render(<PlayerToken pl={{ ...mockPlayer, capt: true }} showStat="gw" />);
    expect(getByText('24')).toBeTruthy(); // 12 * 2
  });
});

// ── GafferLogo ────────────────────────────────────────────────
describe('GafferLogo', () => {
  it('renders default wordmark', () => {
    const { toJSON } = render(<GafferLogo />);
    expect(toJSON()).toBeTruthy();
  });
  it('renders light variant', () => {
    const { toJSON } = render(<GafferLogo light />);
    expect(toJSON()).toBeTruthy();
  });
  it('renders mark variant', () => {
    const { toJSON } = render(<GafferLogo variant="mark" />);
    expect(toJSON()).toBeTruthy();
  });
});

// ── PitchMarks ────────────────────────────────────────────────
describe('PitchMarks', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<PitchMarks />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts opacity prop', () => {
    const { toJSON } = render(<PitchMarks opacity={0.3} />);
    expect(toJSON()).toBeTruthy();
  });
});

// ── ApexPitchMarks ────────────────────────────────────────────
describe('ApexPitchMarks', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<ApexPitchMarks />);
    expect(toJSON()).toBeTruthy();
  });
});

// ── Pitch ─────────────────────────────────────────────────────
const mockRows = [[mockPlayer]];

describe('Pitch', () => {
  it('renders with realistic style', () => {
    const { toJSON } = render(<Pitch rows={mockRows} pitchStyle="realistic" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with flat style', () => {
    const { toJSON } = render(<Pitch rows={mockRows} pitchStyle="flat" />);
    expect(toJSON()).toBeTruthy();
  });
});

// ── ApexPitch ─────────────────────────────────────────────────
const mockApexRows = [[
  { name: 'Haaland', pts: 12, capt: true },
]];

describe('ApexPitch', () => {
  it('renders rows', () => {
    const { toJSON } = render(<ApexPitch rows={mockApexRows} pitchStyle="realistic" upcoming={false} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders upcoming (no pts)', () => {
    const { toJSON } = render(<ApexPitch rows={mockApexRows} pitchStyle="flat" upcoming={true} />);
    expect(toJSON()).toBeTruthy();
  });
});
