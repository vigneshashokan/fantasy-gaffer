import React from 'react';
import { render } from '@testing-library/react-native';
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
import { GwNavBar } from '@/components/team/GwNavBar';
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
import { GenderRow } from '@/components/profile/GenderRow';
import { ToggleRow } from '@/components/profile/ToggleRow';
import { ChangePassword } from '@/components/profile/ChangePassword';
import { DeleteAccount } from '@/components/profile/DeleteAccount';
import { PlusCard } from '@/components/settings/PlusCard';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { FollowUsRow } from '@/components/settings/FollowUsRow';
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
      { name: 'Henderson', pts: 0, gk: true },
      { name: 'Truffert',  pts: 1 },
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

// ── GwNavBar ──────────────────────────────────────────────────
describe('GwNavBar', () => {
  it('renders live gameweek', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(<GwNavBar gw={24} state="live" tk={tk} />);
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
  const player = { name: 'Haaland', club: 'MCI' as const, p: 14.6, f: 9.1, tp: 175, own: 62.3, gw: 16 };

  it('shows name and price', () => {
    const tk = apexTokens(false, 'classic');
    const { getByText } = render(<PickRow p={player} zebra={false} last tk={tk} dark={false} />);
    expect(getByText('Haaland')).toBeTruthy();
    expect(getByText('£14.6m')).toBeTruthy();
  });

  it('marks squad members with In team badge', () => {
    const tk = apexTokens(false, 'classic');
    // Haaland is in our SQUAD
    const { getByText } = render(<PickRow p={player} zebra={false} last tk={tk} dark={false} />);
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
      [{ name: 'Haaland', p: 14.6, pos: 'FWD' as const, club: 'MCI' as const, tp: 175, f: 9.1, own: 62.3, gw: 16 }],
      [{ name: 'Raya', p: 4.2, pos: 'GKP' as const, club: 'ARS' as const, tp: 78, f: 4.2, own: 9.1, gw: 3 }],
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

  it('GenderRow shows current value', () => {
    const { getByText } = render(<GenderRow value="Female" onChange={() => {}} tk={tk} />);
    expect(getByText('Female')).toBeTruthy();
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

  it('NotificationsCard renders header and summary', () => {
    const { getByText } = render(<NotificationsCard tk={tk} />);
    expect(getByText('Notifications')).toBeTruthy();
    expect(getByText('3 of 4 on')).toBeTruthy(); // default state
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
      { name: 'Raya', club: 'ARS' as const, p: 5.6, f: 4.8, tp: 92, own: 28.4, gw: 6 },
    ];
    const { getByText } = render(<PicksCard pos="GKP" rows={rows} tk={tk} dark={false} />);
    expect(getByText('Goalkeepers')).toBeTruthy();
    expect(getByText('Raya')).toBeTruthy();
  });

  it('renders header for FWD', () => {
    const tk = apexTokens(false, 'classic');
    const rows = [
      { name: 'Wood', club: 'NFO' as const, p: 7.5, f: 6.7, tp: 101, own: 26.1, gw: 9 },
    ];
    const { getByText } = render(<PicksCard pos="FWD" rows={rows} tk={tk} dark={false} />);
    expect(getByText('Forwards')).toBeTruthy();
  });
});
