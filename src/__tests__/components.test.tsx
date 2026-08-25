const mockRequestDeletion = jest.fn();

jest.mock('@/lib/auth/account-deletion', () => ({
  __esModule: true,
  requestDeletion: () => mockRequestDeletion(),
}));

jest.mock('@/api/notificationPrefs', () => ({
  __esModule: true,
  useNotificationPrefs: () => ({
    data: { deadlines: false, prices: false, gwConfirm: false, transfer: false } satisfies NotificationPrefs,
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
// ScreenHeader reads the safe-area inset (#180) — these component-level
// renders have no SafeAreaProvider above them.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: { user: { email: string | null } } | null }) => unknown) =>
    selector({
      session: mockSessionEmail ? { user: { email: mockSessionEmail } } : null,
    }),
}));

import React from 'react';
import type { NotificationPrefs } from '@/api/notificationPrefs';
import { StyleSheet } from 'react-native';
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
import { SeasonCompleteBanner } from '@/components/ui/SeasonCompleteBanner';
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
import { ApplyCheckbox } from '@/components/ui/ApplyCheckbox';
import { ApplyAllCard } from '@/components/team/ApplyAllCard';
import { SubPill, SubInPill, GoalsBadge, AssistsBadge, CardIcons, CaptViceBadge } from '@/components/ui/PitchBadges';
import { apexTokens, ON_PITCH } from '@/constants/apexTokens';
import { PALETTE } from '@/constants/theme';
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
import type { CaptainPick, Player } from '@/types/fpl';

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
  it('shows centered GW points with the vs-avg pill and the stat row, no chip section', () => {
    const { getByText, queryByText } = render(
      <HeroCard
        totalPoints={1452}
        gwPts={64}
        avgPoints={52}
        highestPoints={118}
        gradFrom="#37003C"
        gradTo="#5B0F63"
      />
    );
    expect(getByText('64')).toBeTruthy();            // GW PTS
    expect(getByText('↑ +12 vs avg')).toBeTruthy();  // 64 - 52
    expect(getByText('52')).toBeTruthy();            // avg
    expect(getByText('118')).toBeTruthy();           // highest
    expect(getByText('1,452')).toBeTruthy();         // total
    // chip section moved out of the hero card (shown in the banner below)
    expect(queryByText('None')).toBeNull();
    expect(queryByText('Chip Played')).toBeNull();
    expect(queryByText('Apex Pitch FC')).toBeNull(); // team name removed
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
      <ApexDugout
        players={players}
        card="#fff"
        cardBorder="#E7E9F2"
        faint="#8B8694"
        glyphGk="#008343"
        glyph="#7C3AED"
      />
    );
    expect(getByText('Dugout')).toBeTruthy();
    expect(getByText('Henderson')).toBeTruthy();
  });

  // #188: these were hardcoded classic-palette literals, so the dugout painted
  // classic purple/green on the pitch and electric themes.
  it('paints the avatar glyphs from the passed tokens', () => {
    const players = [
      { id: '116', name: 'Henderson', pts: 0, gk: true },
      { id: '245', name: 'Truffert', pts: 1 },
    ];
    const tree = JSON.stringify(
      render(
        <ApexDugout
          players={players}
          card="#0B1224"
          cardBorder="#E7E9F2"
          faint="#8B8694"
          glyphGk="#7CE0A6"
          glyph="#9FD9FF"
        />
      ).toJSON()
    );
    // react-native-svg normalises a fill to an opaque ARGB int, not the hex.
    const argb = (hex: string) => String(0xff000000 + parseInt(hex.slice(1), 16));
    expect(tree).toContain(argb('#7CE0A6')); // keeper
    expect(tree).toContain(argb('#9FD9FF')); // outfielder
    expect(tree).not.toContain(argb('#A78BFA'));
  });

  it('calls onPlayerPress with the tapped bench player', () => {
    const onPlayerPress = jest.fn();
    const players = [
      { id: '116', name: 'Henderson', pts: 0, gk: true },
      { id: '245', name: 'Truffert',  pts: 1 },
    ];
    const { getByText } = render(
      <ApexDugout
        players={players}
        card="#fff"
        cardBorder="#E7E9F2"
        faint="#8B8694"
        glyphGk="#008343"
        glyph="#7C3AED"
        onPlayerPress={onPlayerPress}
      />
    );
    fireEvent.press(getByText('Truffert'));
    expect(onPlayerPress).toHaveBeenCalledWith(players[1]);
  });
});

// ── CaptainPickCard ───────────────────────────────────────────
describe('CaptainPickCard', () => {
  it('marks the applied captain', () => {
    const tk = apexTokens(false, 'classic');
    const picks: CaptainPick[] = [
      { id: '401', name: 'Haaland', club: 'MCI', xp: 8.4, note: 'Home vs bottom-half defence' },
      { id: '233', name: 'Salah',   club: 'LIV', xp: 7.1, note: 'Penalties' },
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

  // #180: the tab bar and AccountMenu segments announced role + selected;
  // this sibling announced neither.
  it('announces each segment as a tab with its selected state', () => {
    const tk = apexTokens(false, 'classic');
    const { getByRole } = render(
      <SegmentedControl options={['GKP', 'DEF', 'MID', 'FWD']} value={2} onChange={() => {}} tk={tk} />
    );
    expect(getByRole('tab', { name: 'MID' }).props.accessibilityState?.selected).toBe(true);
    expect(getByRole('tab', { name: 'GKP' }).props.accessibilityState?.selected).toBe(false);
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
  it('shows the gameweek title and three stats, no team name', () => {
    const { getByText, queryByText } = render(
      <TransferInfoCard
        nextGw={25}
        squadValue={102.5}
        freeTransfers={1}
        inBank={2.4}
        gradFrom="#37003C"
        gradTo="#5B0F63"
      />
    );
    expect(getByText('Gameweek 25')).toBeTruthy();
    expect(getByText('Free Transfers')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
    expect(getByText('In the Bank')).toBeTruthy();
    expect(getByText('£2.4m')).toBeTruthy();
    expect(getByText('Squad Value')).toBeTruthy();
    expect(getByText('£102.5m')).toBeTruthy();
    expect(queryByText('Apex Pitch FC')).toBeNull();
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

  // buildApexTeam hardcoded deadline: '' for the whole of Phase 1-5, so this
  // shipped rendering "Deadline for Gameweek 2: " with a dangling colon. It
  // was invisible only because both call sites need a squad, and FPL serves
  // none until the first deadline passes.
  it('renders nothing without a deadline, rather than a dangling colon', () => {
    const tk = apexTokens(false, 'classic');
    const { queryByText } = render(<DeadlineBanner nextGw={2} deadline="" tk={tk} />);
    expect(queryByText(/Deadline for Gameweek/)).toBeNull();
  });
});

// ── SeasonCompleteBanner ──────────────────────────────────────
describe('SeasonCompleteBanner', () => {
  it('renders the season-completed message with the season label', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(
      <SeasonCompleteBanner seasonLabel="2025/26" tk={tk} />
    );
    expect(getByText('2025/26 Season completed')).toBeTruthy();
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

  // #180: a used chip is inert and an available one expands a tip panel —
  // neither fact reached assistive tech.
  it('announces each tile as a button, with expanded and disabled state', () => {
    const tk = apexTokens(false, 'classic');
    const chips = [
      { name: 'Wildcard', status: 'Available',  state: 'active' as const },
      { name: 'Free Hit', status: 'Used GW 12', state: 'used'   as const, playedGw: 12 },
    ];
    const { getAllByRole } = render(<ChipsRow chips={chips} tk={tk} />);
    const [wildcard, freeHit] = getAllByRole('button');
    expect(wildcard.props.accessibilityState).toEqual({ expanded: false, disabled: false });
    expect(freeHit.props.accessibilityState).toEqual({ expanded: false, disabled: true });

    fireEvent.press(wildcard);
    expect(getAllByRole('button')[0].props.accessibilityState?.expanded).toBe(true);
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
  // #180: the monetization surface's main control rendered only a tick, with
  // no role, state or name — while forms' own checkbox was correct.
  it('announces as a checkbox with its checked state and label', () => {
    const on = render(
      <ApplyCheckbox checked onChange={() => {}} green="#0f0" border="#ccc" accessibilityLabel="Apply all" />,
    );
    const box = on.getByRole('checkbox', { name: 'Apply all' });
    expect(box.props.accessibilityState?.checked).toBe(true);

    const off = render(
      <ApplyCheckbox checked={false} onChange={() => {}} green="#0f0" border="#ccc" accessibilityLabel="Apply all" />,
    );
    expect(off.getByRole('checkbox').props.accessibilityState?.checked).toBe(false);
  });

  it('renders both states', () => {
    const a = render(<ApplyCheckbox checked onChange={() => {}} green="#0f0" border="#ccc" accessibilityLabel="Apply" />);
    expect(a.toJSON()).toBeTruthy();
    const b = render(<ApplyCheckbox checked={false} onChange={() => {}} green="#0f0" border="#ccc" accessibilityLabel="Apply" />);
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
    expect(getByText('Save plan')).toBeTruthy();
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
  it('renders sub badges, goal/assist stacks and cards', () => {
    expect(render(<SubPill min={75} />).getByText("←75'")).toBeTruthy();
    expect(render(<SubInPill min={75} />).getByText("75'→")).toBeTruthy();
    // #188: pins the fills to the guarded tokens. Hardcoding a fresh literal
    // here is how both pills drifted below AA unnoticed in the first place.
    expect(JSON.stringify(render(<SubPill min={75} />).toJSON())).toContain(ON_PITCH.subOff);
    expect(JSON.stringify(render(<SubInPill min={75} />).toJSON())).toContain(ON_PITCH.subIn);
    expect(render(<GoalsBadge count={3} />).getByLabelText('3 goals')).toBeTruthy();
    expect(render(<AssistsBadge count={2} />).getByLabelText('2 assists')).toBeTruthy();
    const cards = render(<CardIcons cards={['yellow', 'red']} />);
    expect(cards.getByTestId('card-yellow')).toBeTruthy();
    expect(cards.getByTestId('card-red')).toBeTruthy();
  });
  it('renders nothing for a zero count', () => {
    expect(render(<GoalsBadge count={0} />).toJSON()).toBeNull();
  });
  it('renders a captain badge, a vice badge, and nothing for a regular player', () => {
    expect(render(<CaptViceBadge capt />).getByText('C')).toBeTruthy();
    expect(render(<CaptViceBadge vice />).getByText('V')).toBeTruthy();
    expect(render(<CaptViceBadge capt vice />).getByText('C')).toBeTruthy();
    expect(render(<CaptViceBadge />).toJSON()).toBeNull();
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

  // Every caller is a modal; on iOS the sheet starts below the status bar, so
  // the window inset (mocked at 47 above) is dead space, not safe area.
  it('does not pad for the status bar on iOS', () => {
    const { getByTestId } = render(
      <ScreenHeader title="Profile" gradFrom="#37003C" gradTo="#5B0F63" onBack={() => {}} />
    );
    expect(StyleSheet.flatten(getByTestId('screen-header').props.style).paddingTop).toBe(12);
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

  it('ChangePassword accordion header has accessibilityState.expanded false when closed, true when open', () => {
    const { getByRole } = render(<ChangePassword tk={tk} />);
    const headerBtn = getByRole('button', { name: 'Change password' });
    expect(headerBtn.props.accessibilityState?.expanded).toBe(false);
    fireEvent.press(headerBtn);
    expect(headerBtn.props.accessibilityState?.expanded).toBe(true);
  });

  it('ChangePassword submit button has accessibilityState.disabled=true when fields are empty', () => {
    const { getByText, getByRole } = render(<ChangePassword tk={tk} />);
    fireEvent.press(getByText('Change password')); // expand
    const submitBtn = getByRole('button', { name: 'Update password' });
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
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

  it('DeleteAccount delete button has accessibilityState.disabled=true when email does not match', () => {
    const { getByText, getByRole } = render(<DeleteAccount tk={tk} />);
    fireEvent.press(getByText('Delete account'));
    const deleteBtn = getByRole('button', { name: 'Delete' });
    expect(deleteBtn.props.accessibilityState?.disabled).toBe(true);
  });
});

// ── Settings components ───────────────────────────────────────
describe('Settings components', () => {
  const tk = apexTokens(false, 'classic');

  // #174: the premium pitch is gated on the `premium_paywall` flag, which the
  // manual posthog mock leaves undefined → FLAG_DEFAULTS false → not rendered.
  it('PlusCard renders nothing while the premium_paywall flag is off', () => {
    const { toJSON } = render(<PlusCard gradFrom="#37003C" gradTo="#5B0F63" />);
    expect(toJSON()).toBeNull();
  });

  // Labels must match `PALETTE` in constants/theme.ts — the electric swatch
  // was the odd one out, reading "Fantasy" only here.
  it('ThemeToggle shows all 3 palette labels', () => {
    const { getByText } = render(<ThemeToggle palette="classic" onSetPalette={() => {}} />);
    for (const { label } of PALETTE) expect(getByText(label)).toBeTruthy();
  });

  it('ThemeToggle marks the active palette selected', () => {
    const { getByRole } = render(<ThemeToggle palette="pitch" onSetPalette={() => {}} />);
    const selected = (label: string) =>
      getByRole('button', { name: label }).props.accessibilityState?.selected;
    expect(selected('Pitch')).toBe(true);
    expect(selected('Classic')).toBe(false);
  });

  it('NotificationsCard renders summary from fetched prefs', () => {
    const { getByText } = render(<NotificationsCard tk={tk} />);
    expect(getByText('Notifications')).toBeTruthy();
    expect(getByText('All off')).toBeTruthy(); // driven by the mocked hook (all four off)
  });

  // #180: its twins in ChangePassword and FollowUsRow already did this.
  it('NotificationsCard expander announces role and expanded state', () => {
    const { getByRole } = render(<NotificationsCard tk={tk} />);
    const head = getByRole('button', { name: /Notifications/ });
    expect(head.props.accessibilityState?.expanded).toBe(false);
    fireEvent.press(head);
    expect(
      getByRole('button', { name: /Notifications/ }).props.accessibilityState?.expanded,
    ).toBe(true);
  });

  it('SettingsRow renders label', () => {
    const { getByText } = render(
      <SettingsRow icon={<></>} label="Send Feedback" onPress={() => {}} tk={tk} />
    );
    expect(getByText('Send Feedback')).toBeTruthy();
  });

  // FollowUsRow was deleted in #174 — five rows whose onPress was `() => {}`,
  // pointing at social handles that don't exist yet.
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
