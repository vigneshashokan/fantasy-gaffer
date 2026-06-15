const mockRequestDeletion = jest.fn();

jest.mock('@/lib/auth/account-deletion', () => ({
  __esModule: true,
  requestDeletion: () => mockRequestDeletion(),
}));

jest.mock('@/api/notificationPrefs', () => ({
  __esModule: true,
  useNotificationPrefs: () => ({
    data: { deadlines: false, prices: false, gwConfirm: false, transfer: false },
    isPending: false,
  }),
  useUpdateNotificationPrefs: () => ({ mutate: jest.fn(), isError: false }),
}));

const mockChangePassword = jest.fn();
jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  changePassword: (cur: string, next: string) => mockChangePassword(cur, next),
}));

let mockSessionEmail: string | null = 'ada@example.com';
jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: { user: { email: string | null } } | null }) => unknown) =>
    selector({
      session: mockSessionEmail ? { user: { email: mockSessionEmail } } : null,
    }),
}));

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Icon } from '@/components/ui/Icon';
import { PosTag } from '@/components/ui/PosTag';
import { PillBtn } from '@/components/ui/PillBtn';
import { Kit } from '@/components/ui/Kit';
import { PlayerToken } from '@/components/ui/PlayerToken';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { Field } from '@/components/forms/Field';
import { SocialBtn } from '@/components/forms/SocialBtn';
import { SlideVisual } from '@/components/onboarding/SlideVisual';
import { HeroCard } from '@/components/team/HeroCard';
import { ApexDugout } from '@/components/team/ApexDugout';
import { CaptainPickCard } from '@/components/team/CaptainPickCard';
import { SuggestionsCard } from '@/components/team/SuggestionsCard';
import { GwPill } from '@/components/team/GwNav';
import { SegmentedControl } from '@/components/picks/SegmentedControl';
import { PickRow } from '@/components/picks/PickRow';
import { PicksCard } from '@/components/picks/PicksCard';
import { TransferInfoCard } from '@/components/transfer/TransferInfoCard';
import { DeadlineBanner } from '@/components/transfer/DeadlineBanner';
import { ChipsRow } from '@/components/transfer/ChipsRow';
import { TransferPitch } from '@/components/transfer/TransferPitch';
import { TransferSuggestionsCard } from '@/components/transfer/TransferSuggestionsCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { Toggle } from '@/components/ui/Toggle';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ReadField } from '@/components/profile/ReadField';
import { ToggleRow } from '@/components/profile/ToggleRow';
import { ChangePassword } from '@/components/profile/ChangePassword';
import { DeleteAccount } from '@/components/profile/DeleteAccount';
import { PlusCard } from '@/components/settings/PlusCard';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { FollowUsRow } from '@/components/settings/FollowUsRow';
import { ApplyCheckbox } from '@/components/ui/ApplyCheckbox';
import { ApplyAllCard } from '@/components/team/ApplyAllCard';
import { SubPill, SubInPill, BallBadge, CardIcons } from '@/components/ui/PitchBadges';
import { apexTokens } from '@/constants/apexTokens';
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
import type { Player } from '@/types/fpl';

const mockPlayer: Player = {
  id: 'p1', name: 'Haaland', club: 'MCI', pos: 'FWD',
  gw: 12, p: 15.0, f: 9.1, tp: 175, own: 62.3, capt: false, vice: false,
  status: 'a', news: '', chanceNext: null, ict: 312.4, bps: 640,
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

// ── Field ─────────────────────────────────────────────────────
describe('Field', () => {
  const baseProps = {
    placeholder: 'Email',
    value: '',
    onChangeText: () => {},
    surfaceAlt: '#F6F1FA',
    line: '#ECEEF6',
    accent: '#00B863',
    text: '#23042B',
    textMuted: '#74627E',
  };

  it('renders email field', () => {
    const { getByPlaceholderText } = render(
      <Field {...baseProps} icon="mail" placeholder="Email address" />
    );
    expect(getByPlaceholderText('Email address')).toBeTruthy();
  });

  it('renders password field', () => {
    const { getByPlaceholderText } = render(
      <Field {...baseProps} icon="lock" placeholder="Password" secureTextEntry />
    );
    expect(getByPlaceholderText('Password')).toBeTruthy();
  });

  it('renders a "Show password" toggle on a secure field', () => {
    const { getByLabelText } = render(
      <Field {...baseProps} icon="lock" placeholder="Password" secureTextEntry />
    );
    expect(getByLabelText('Show password')).toBeTruthy();
  });

  it('toggles secureTextEntry when the eye is pressed', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <Field {...baseProps} icon="lock" placeholder="Password" secureTextEntry />
    );
    const input = getByPlaceholderText('Password');
    expect(input.props.secureTextEntry).toBe(true);
    fireEvent.press(getByLabelText('Show password'));
    expect(input.props.secureTextEntry).toBe(false);
    expect(getByLabelText('Hide password')).toBeTruthy();
    fireEvent.press(getByLabelText('Hide password'));
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('does not render a password toggle on a non-secure field', () => {
    const { queryByLabelText } = render(
      <Field {...baseProps} icon="mail" placeholder="Email address" />
    );
    expect(queryByLabelText(/password/i)).toBeNull();
  });
});

// ── SocialBtn ─────────────────────────────────────────────────
describe('SocialBtn', () => {
  it('renders google', () => {
    const { getByText } = render(<SocialBtn provider="google" onPress={() => {}} />);
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('renders apple', () => {
    const { getByText } = render(<SocialBtn provider="apple" onPress={() => {}} />);
    expect(getByText('Continue with Apple')).toBeTruthy();
  });
});

// ── SlideVisual ───────────────────────────────────────────────
describe('SlideVisual', () => {
  it('renders picks variant', () => {
    const { toJSON } = render(<SlideVisual variant="picks" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders team variant', () => {
    const { toJSON } = render(<SlideVisual variant="team" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders strategy variant', () => {
    const { toJSON } = render(<SlideVisual variant="strategy" />);
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
    const { toJSON } = render(<ApexPitchMarks width={350} height={400} />);
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
  { id: '328', name: 'Haaland', pts: 12, capt: true },
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

// ── HeroCard ──────────────────────────────────────────────────
describe('HeroCard', () => {
  it('renders team name and points', () => {
    const { getByText } = render(
      <HeroCard
        teamName="Apex Pitch FC"
        totalPoints={1452}
        gwPts={64}
        avgPoints={52}
        highestPoints={118}
        gradFrom="#37003C"
        gradTo="#5B0F63"
      />
    );
    expect(getByText('Apex Pitch FC')).toBeTruthy();
    expect(getByText('1,452')).toBeTruthy();
    expect(getByText('64')).toBeTruthy();
  });
});

// ── ApexDugout ────────────────────────────────────────────────
describe('ApexDugout', () => {
  it('renders bench players', () => {
    const players = [
      { id: '116', name: 'Henderson', pts: 0, gk: true },
      { id: '245', name: 'Truffert',  pts: 1 },
    ];
    const { getByText } = render(
      <ApexDugout players={players} card="#fff" cardBorder="#E7E9F2" faint="#8B8694" />
    );
    expect(getByText('Dugout')).toBeTruthy();
    expect(getByText('Henderson')).toBeTruthy();
  });
});

// ── CaptainPickCard ───────────────────────────────────────────
describe('CaptainPickCard', () => {
  it('marks the applied captain', () => {
    const tk = apexTokens(false, 'classic');
    const picks = [
      { name: 'Haaland', club: 'MCI' as const, xp: 8.4, note: 'Home vs bottom-half defence' },
      { name: 'Salah',   club: 'LIV' as const, xp: 7.1, note: 'Penalties' },
    ];
    const { getByText } = render(
      <CaptainPickCard picks={picks} captainApplied="Haaland" tk={tk} />
    );
    expect(getByText('Captain Pick')).toBeTruthy();
    expect(getByText('Haaland')).toBeTruthy();
    expect(getByText('Locked')).toBeTruthy();
  });
});

// ── SuggestionsCard ───────────────────────────────────────────
describe('SuggestionsCard', () => {
  it('renders suggestions in locked state', () => {
    const tk = apexTokens(false, 'classic');
    const suggestions = [
      { id: 's1', type: 'sub' as const, text: 'Sub Walker',  detail: 'Rotation risk', gain: '+2 xPts', wasApplied: true },
      { id: 's2', type: 'sub' as const, text: 'Sub Turner',  detail: 'Areola knock',  gain: '+1 xPts', wasApplied: false },
    ];
    const { getByText } = render(<SuggestionsCard suggestions={suggestions} tk={tk} />);
    expect(getByText('Team Suggestions')).toBeTruthy();
    expect(getByText('Sub Walker')).toBeTruthy();
    expect(getByText('Applied')).toBeTruthy();
    expect(getByText('Not applied')).toBeTruthy();
  });
});

// ── GwPill ────────────────────────────────────────────────────
describe('GwPill', () => {
  it('renders live gameweek', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(<GwPill gw={24} state="live" tk={tk} />);
    expect(getByText('Gameweek 24')).toBeTruthy();
  });
});

// ── SegmentedControl ──────────────────────────────────────────
describe('SegmentedControl', () => {
  it('renders 4 segments', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(
      <SegmentedControl options={['GKP', 'DEF', 'MID', 'FWD']} value={0} onChange={() => {}} tk={tk} />
    );
    expect(getByText('GKP')).toBeTruthy();
    expect(getByText('FWD')).toBeTruthy();
  });
});

// ── PickRow ───────────────────────────────────────────────────
describe('PickRow', () => {
  const player = { id: '328', name: 'Haaland', club: 'MCI' as const, p: 14.6, f: 9.1, tp: 175, own: 62.3, gw: 16 };

  it('shows name and price', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(<PickRow p={player} zebra={false} last tk={tk} dark={false} fixtures={{}} squadNames={new Set()} />);
    expect(getByText('Haaland')).toBeTruthy();
    expect(getByText('£14.6m')).toBeTruthy();
  });

  it('marks squad members with In team badge', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(<PickRow p={player} zebra={false} last tk={tk} dark={false} fixtures={{}} squadNames={new Set(['Haaland'])} />);
    expect(getByText('In team')).toBeTruthy();
  });
});

// ── TransferInfoCard ──────────────────────────────────────────
describe('TransferInfoCard', () => {
  it('shows team name, GW, squad value', () => {
    const { getByText } = render(
      <TransferInfoCard
        teamName="Apex Pitch FC"
        nextGw={25}
        squadValue={102.5}
        freeTransfers={1}
        inBank={2.4}
        gradFrom="#37003C"
        gradTo="#5B0F63"
      />
    );
    expect(getByText('Apex Pitch FC')).toBeTruthy();
    expect(getByText('Gameweek 25')).toBeTruthy();
    expect(getByText('£102.5m')).toBeTruthy();
    expect(getByText('£2.4m')).toBeTruthy();
  });
});

// ── DeadlineBanner ────────────────────────────────────────────
describe('DeadlineBanner', () => {
  it('renders deadline copy', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(
      <DeadlineBanner nextGw={25} deadline="Sat 11:00AM PST" tk={tk} />
    );
    expect(getByText('Deadline for Gameweek 25: Sat 11:00AM PST')).toBeTruthy();
  });
});

// ── ChipsRow ──────────────────────────────────────────────────
describe('ChipsRow', () => {
  it('renders chip names', () => {
    const tk = apexTokens(false, 'classic');
    const chips = [
      { name: 'Wildcard', status: 'Available',  state: 'active' as const },
      { name: 'Free Hit', status: 'Used GW 12', state: 'used'   as const, playedGw: 12 },
    ];
    const { getByText } = render(<ChipsRow chips={chips} tk={tk} />);
    expect(getByText('Wildcard')).toBeTruthy();
    expect(getByText('Free Hit')).toBeTruthy();
  });
});

// ── TransferPitch ─────────────────────────────────────────────
describe('TransferPitch', () => {
  it('renders rows with players', () => {
    const rows = [
      [{ id: '328', name: 'Haaland', p: 14.6, pos: 'FWD' as const, club: 'MCI' as const, tp: 175, f: 9.1, own: 62.3, gw: 16 }],
      [{ id: '427', name: 'Raya', p: 4.2, pos: 'GKP' as const, club: 'ARS' as const, tp: 78, f: 4.2, own: 9.1, gw: 3 }],
    ];
    const { getByText } = render(<TransferPitch rows={rows} pitchStyle="realistic" />);
    expect(getByText('Haaland')).toBeTruthy();
    expect(getByText('£14.6m')).toBeTruthy();
  });
});

// ── TransferSuggestionsCard ───────────────────────────────────
describe('TransferSuggestionsCard', () => {
  it('renders out/in players + gain', () => {
    const tk = apexTokens(false, 'classic');
    const suggestions = [
      { id: 't1', out: 'Walker', outClub: 'MCI' as const, in: 'Muñoz', inClub: 'CRY' as const, detail: 'Rotation risk', gain: '+6 xPts' },
    ];
    const { getByText } = render(
      <TransferSuggestionsCard suggestions={suggestions} tk={tk} />
    );
    expect(getByText('Transfer Suggestions')).toBeTruthy();
    expect(getByText('Walker')).toBeTruthy();
    expect(getByText('Muñoz')).toBeTruthy();
    expect(getByText('+6 xPts')).toBeTruthy();
  });
});

// ── ApplyCheckbox ─────────────────────────────────────────────
describe('ApplyCheckbox', () => {
  it('renders both states', () => {
    const a = render(<ApplyCheckbox checked onChange={() => {}} green="#0f0" border="#ccc" />);
    expect(a.toJSON()).toBeTruthy();
    const b = render(<ApplyCheckbox checked={false} onChange={() => {}} green="#0f0" border="#ccc" />);
    expect(b.toJSON()).toBeTruthy();
  });
});

// ── ApplyAllCard ──────────────────────────────────────────────
describe('ApplyAllCard', () => {
  it('shows pending changes count and CTAs', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(
      <ApplyAllCard count={2} onUndo={() => {}} onConfirm={() => {}} tk={tk} />
    );
    expect(getByText('2 changes pending')).toBeTruthy();
    expect(getByText('Undo all changes')).toBeTruthy();
    expect(getByText('Confirm')).toBeTruthy();
  });

  it('shows singular form when count is 1', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(
      <ApplyAllCard count={1} onUndo={() => {}} onConfirm={() => {}} tk={tk} />
    );
    expect(getByText('1 change pending')).toBeTruthy();
  });
});

// ── PitchBadges ───────────────────────────────────────────────
describe('PitchBadges', () => {
  it('renders sub badges and ball', () => {
    const a = render(<SubPill min={75} />);
    expect(a.getByText("←75'")).toBeTruthy();
    const b = render(<SubInPill min={75} />);
    expect(b.getByText("75'→")).toBeTruthy();
    const c = render(<BallBadge />);
    expect(c.toJSON()).toBeTruthy();
    const d = render(<CardIcons cards={['yellow', 'red']} />);
    expect(d.toJSON()).toBeTruthy();
  });
});

// ── Shared primitives ─────────────────────────────────────────
describe('SectionCard', () => {
  it('renders title and children', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(
      <SectionCard title="Personal details" tk={tk}>
        <></>
      </SectionCard>
    );
    expect(getByText('Personal details')).toBeTruthy();
  });
});

describe('Toggle', () => {
  it('renders both states without crash', () => {
    const { toJSON: a } = render(<Toggle value onChange={() => {}} onColor="#0f0" offColor="#ccc" />);
    expect(a()).toBeTruthy();
    const { toJSON: b } = render(<Toggle value={false} onChange={() => {}} onColor="#0f0" offColor="#ccc" />);
    expect(b()).toBeTruthy();
  });
});

describe('ScreenHeader', () => {
  it('renders title', () => {
    const { getByText } = render(
      <ScreenHeader title="Profile" gradFrom="#37003C" gradTo="#5B0F63" onBack={() => {}} />
    );
    expect(getByText('Profile')).toBeTruthy();
  });
});

// ── Profile components ────────────────────────────────────────
describe('Profile components', () => {
  const tk = apexTokens(false, 'classic');

  it('ReadField shows label and value', () => {
    const { getByText } = render(<ReadField label="First name" value="Apex" tk={tk} />);
    expect(getByText('First name')).toBeTruthy();
    expect(getByText('Apex')).toBeTruthy();
  });

  it('ToggleRow shows label and sub', () => {
    const { getByText } = render(
      <ToggleRow label="Face ID" sub="Biometric sign-in" value onChange={() => {}} tk={tk} />
    );
    expect(getByText('Face ID')).toBeTruthy();
    expect(getByText('Biometric sign-in')).toBeTruthy();
  });

  it('ChangePassword renders collapsed', () => {
    const { getByText } = render(<ChangePassword tk={tk} />);
    expect(getByText('Change password')).toBeTruthy();
  });

  it('ChangePassword toggles password visibility with the eye button', () => {
    const { getByText, getByPlaceholderText, getAllByLabelText } = render(<ChangePassword tk={tk} />);
    fireEvent.press(getByText('Change password')); // expand

    // Each field starts masked.
    expect(getByPlaceholderText('Current password').props.secureTextEntry).toBe(true);

    // Reveal the current-password field (first of the three eye buttons).
    fireEvent.press(getAllByLabelText('Show password')[0]);
    expect(getByPlaceholderText('Current password').props.secureTextEntry).toBe(false);
    // The other fields stay masked (per-field toggle).
    expect(getByPlaceholderText('New password').props.secureTextEntry).toBe(true);

    // Toggling back re-masks it.
    fireEvent.press(getAllByLabelText('Hide password')[0]);
    expect(getByPlaceholderText('Current password').props.secureTextEntry).toBe(true);
  });

  it('ChangePassword shows an inline error when the current password is wrong', async () => {
    mockChangePassword.mockResolvedValueOnce({ ok: false, error: 'invalid_credentials' });
    const { getByText, getByPlaceholderText } = render(<ChangePassword tk={tk} />);

    fireEvent.press(getByText('Change password')); // expand
    fireEvent.changeText(getByPlaceholderText('Current password'), 'wrong');
    fireEvent.changeText(getByPlaceholderText('New password'), 'NewPass1');
    fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'NewPass1');
    fireEvent.press(getByText('Update password'));

    await waitFor(() => expect(getByText('Current password is incorrect.')).toBeTruthy());
    expect(mockChangePassword).toHaveBeenCalledWith('wrong', 'NewPass1');
  });

  it('DeleteAccount renders initial button', () => {
    const { getByText } = render(<DeleteAccount tk={tk} />);
    expect(getByText('Delete account')).toBeTruthy();
  });
});

// ── Settings components ───────────────────────────────────────
describe('Settings components', () => {
  const tk = apexTokens(false, 'classic');

  it('PlusCard renders promo copy', () => {
    const { getByText } = render(<PlusCard gradFrom="#37003C" gradTo="#5B0F63" />);
    expect(getByText('FPL Gaffer')).toBeTruthy();
    expect(getByText('Go Premium')).toBeTruthy();
  });

  it('ThemeToggle shows all 3 palette labels', () => {
    const { getByText } = render(<ThemeToggle palette="classic" onSetPalette={() => {}} />);
    expect(getByText('Classic')).toBeTruthy();
    expect(getByText('Fantasy')).toBeTruthy();
    expect(getByText('Pitch')).toBeTruthy();
  });

  it('NotificationsCard renders summary from fetched prefs', () => {
    const { getByText } = render(<NotificationsCard tk={tk} />);
    expect(getByText('Notifications')).toBeTruthy();
    expect(getByText('All off')).toBeTruthy(); // driven by the mocked hook (all four off)
  });

  it('SettingsRow renders label', () => {
    const { getByText } = render(
      <SettingsRow icon={<></>} label="Send Feedback" onPress={() => {}} tk={tk} />
    );
    expect(getByText('Send Feedback')).toBeTruthy();
  });

  it('FollowUsRow renders head', () => {
    const { getByText } = render(<FollowUsRow tk={tk} />);
    expect(getByText('Follow Us')).toBeTruthy();
  });
});

// ── PicksCard ─────────────────────────────────────────────────
describe('PicksCard', () => {
  it('renders header for GKP', () => {
    const tk = apexTokens(false, 'classic');
    const rows = [
      { id: '427', name: 'Raya', club: 'ARS' as const, p: 5.6, f: 4.8, tp: 92, own: 28.4, gw: 6 },
    ];
    const { getByText } = render(<PicksCard pos="GKP" rows={rows} tk={tk} dark={false} fixtures={{}} squadNames={new Set()} />);
    expect(getByText('Goalkeepers')).toBeTruthy();
    expect(getByText('Raya')).toBeTruthy();
  });

  it('renders header for FWD', () => {
    const tk = apexTokens(false, 'classic');
    const rows = [
      { id: '519', name: 'Wood', club: 'NFO' as const, p: 7.5, f: 6.7, tp: 101, own: 26.1, gw: 9 },
    ];
    const { getByText } = render(<PicksCard pos="FWD" rows={rows} tk={tk} dark={false} fixtures={{}} squadNames={new Set()} />);
    expect(getByText('Forwards')).toBeTruthy();
  });
});

// ── Checkbox ──────────────────────────────────────────────────
import { Checkbox } from '@/components/forms/Checkbox';

describe('Checkbox', () => {
  it('renders label', () => {
    const { getByText } = render(
      <Checkbox
        label="Remember to use Face ID"
        value={false}
        onChange={() => {}}
        accent="#00B863"
        text="#23042B"
        textMuted="#74627E"
      />,
    );
    expect(getByText('Remember to use Face ID')).toBeTruthy();
  });

  it('shows checked state via accessibility', () => {
    const { getByLabelText } = render(
      <Checkbox
        label="Remember to use Face ID"
        value={true}
        onChange={() => {}}
        accent="#00B863"
        text="#23042B"
        textMuted="#74627E"
      />,
    );
    const node = getByLabelText('Remember to use Face ID');
    expect(node.props.accessibilityState?.checked).toBe(true);
  });

  it('calls onChange with the inverted value when pressed', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <Checkbox
        label="Remember to use Face ID"
        value={false}
        onChange={onChange}
        accent="#00B863"
        text="#23042B"
        textMuted="#74627E"
      />,
    );
    fireEvent.press(getByLabelText('Remember to use Face ID'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// ── DeleteAccount ─────────────────────────────────────────────
describe('DeleteAccount', () => {
  const tk = apexTokens(true, 'classic');

  beforeEach(() => {
    mockRequestDeletion.mockReset();
    mockSessionEmail = 'ada@example.com';
  });

  function openConfirmCard(getByText: ReturnType<typeof render>['getByText']) {
    fireEvent.press(getByText('Delete account'));
  }

  it('Delete button is disabled until email is typed correctly', () => {
    const { getByText, getByPlaceholderText, queryByText } = render(
      <DeleteAccount tk={tk} />,
    );
    openConfirmCard(getByText);
    // Typed wrong email → still no requestDeletion call.
    fireEvent.changeText(getByPlaceholderText('Type your email'), 'wrong@example.com');
    fireEvent.press(getByText('Delete'));
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    // Button visible but inert.
    expect(queryByText('Delete')).toBeTruthy();
  });

  it('Delete button calls requestDeletion when email matches (case-insensitive)', async () => {
    mockRequestDeletion.mockResolvedValueOnce({ ok: true, value: undefined });
    const { getByText, getByPlaceholderText } = render(<DeleteAccount tk={tk} />);
    openConfirmCard(getByText);
    fireEvent.changeText(getByPlaceholderText('Type your email'), 'ADA@EXAMPLE.COM');
    fireEvent.press(getByText('Delete'));
    await waitFor(() => expect(mockRequestDeletion).toHaveBeenCalled());
  });

  it('shows inline error when requestDeletion returns not ok', async () => {
    mockRequestDeletion.mockResolvedValueOnce({ ok: false, error: 'network' });
    const { getByText, getByPlaceholderText, findByText } = render(
      <DeleteAccount tk={tk} />,
    );
    openConfirmCard(getByText);
    fireEvent.changeText(getByPlaceholderText('Type your email'), 'ada@example.com');
    fireEvent.press(getByText('Delete'));
    await findByText(/Couldn't request deletion/i);
  });

  it('Cancel closes the confirm card without calling requestDeletion', () => {
    const { getByText, queryByText } = render(<DeleteAccount tk={tk} />);
    openConfirmCard(getByText);
    fireEvent.press(getByText('Cancel'));
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    // Confirm card is gone, "Delete account" opener is back.
    expect(queryByText('Delete account')).toBeTruthy();
  });
});
