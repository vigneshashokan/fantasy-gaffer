export type ClubCode =
  | 'ARS' | 'LIV' | 'MCI' | 'CHE' | 'MUN' | 'NEW' | 'TOT'
  | 'AVL' | 'NFO' | 'BHA' | 'BOU' | 'BRE' | 'CRY' | 'EVE'
  | 'WOL' | 'FUL' | 'WHU';

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

export interface Club {
  name: string;
  kit: string;
  kit2: string;
  ink: string;
}

export interface Player {
  id: string;
  name: string;
  pos: Position;
  club: ClubCode;
  p: number;
  f: number;
  tp: number;
  own: number;
  gw: number;
  capt?: boolean;
  vice?: boolean;
  sub?: number;
  subIn?: number;
}

export interface TopPickPlayer {
  name: string;
  club: ClubCode;
  p: number;
  f: number;
  tp: number;
  own: number;
  gw: number;
}

export interface Chip {
  id: string;
  name: string;
  sub: string;
  available: boolean;
  playedGW?: number;
  icon: string;
}

export interface Fixture {
  opp: ClubCode;
  h: boolean;
}

export interface PitchPlayer {
  name: string;
  pts: number | null;
  capt?: boolean;
  ball?: boolean;
  sub?: number;
  subIn?: number;
  cards?: Array<'yellow' | 'red'>;
  gk?: boolean;
  alert?: boolean;
}

export interface TransferPitchPlayer {
  name: string;
  p: number;
  pos: Position;
  club: ClubCode;
  tp: number;
  f: number;
  own: number;
  gw: number;
  capt?: boolean;
}

export interface CaptainPick {
  name: string;
  club: ClubCode;
  xp: number;
  note: string;
}

export interface Suggestion {
  id: string;
  type: 'sub' | 'transfer';
  text: string;
  detail: string;
  gain: string;
  wasApplied: boolean;
}

export interface TransferSuggestion {
  id: string;
  out: string;
  outClub: ClubCode;
  in: string;
  inClub: ClubCode;
  detail: string;
  gain: string;
}

export interface TransferChip {
  name: string;
  status: string;
  state: 'active' | 'used' | 'idle';
  playedGw?: number;
  tip?: { title: string; lines: string[] };
}

export interface TeamInfo {
  name: string;
  gw: number;
  gwPoints: number;
  totalPoints: number;
  rank: number;
}

// ─── Clubs ────────────────────────────────────────────────────────────────────

export const CLUBS: Record<ClubCode, Club> = {
  ARS: { name: 'Arsenal',        kit: '#EF0107', kit2: '#fff',    ink: '#fff' },
  LIV: { name: 'Liverpool',      kit: '#C8102E', kit2: '#00B2A9', ink: '#fff' },
  MCI: { name: 'Man City',       kit: '#6CABDD', kit2: '#fff',    ink: '#0a2d5e' },
  CHE: { name: 'Chelsea',        kit: '#034694', kit2: '#fff',    ink: '#fff' },
  MUN: { name: 'Man United',     kit: '#DA291C', kit2: '#000',    ink: '#fff' },
  NEW: { name: 'Newcastle',      kit: '#1A1A1A', kit2: '#fff',    ink: '#fff' },
  TOT: { name: 'Tottenham',      kit: '#F4F4F4', kit2: '#132257', ink: '#132257' },
  AVL: { name: 'Aston Villa',    kit: '#670E36', kit2: '#95BFE5', ink: '#95BFE5' },
  NFO: { name: "Nott'm Forest",  kit: '#DD0000', kit2: '#fff',    ink: '#fff' },
  BHA: { name: 'Brighton',       kit: '#0057B8', kit2: '#fff',    ink: '#fff' },
  BOU: { name: 'Bournemouth',    kit: '#B50E12', kit2: '#000',    ink: '#fff' },
  BRE: { name: 'Brentford',      kit: '#E30613', kit2: '#fff',    ink: '#fff' },
  CRY: { name: 'Crystal Palace', kit: '#1B458F', kit2: '#C4122E', ink: '#fff' },
  EVE: { name: 'Everton',        kit: '#003399', kit2: '#fff',    ink: '#fff' },
  WOL: { name: 'Wolves',         kit: '#FDB913', kit2: '#231F20', ink: '#231F20' },
  FUL: { name: 'Fulham',         kit: '#F4F4F4', kit2: '#000',    ink: '#222' },
  WHU: { name: 'West Ham',       kit: '#7A263A', kit2: '#1BB1E7', ink: '#fff' },
};

// ─── Squad ────────────────────────────────────────────────────────────────────

export const SQUAD: { starters: Player[]; bench: Player[] } = {
  starters: [
    { id: 'raya',      name: 'Raya',         pos: 'GKP', club: 'ARS', p: 4.2,  f: 4.2, tp: 78,  own: 9.1,  gw: 3 },
    { id: 'gabriel',   name: 'Gabriel',      pos: 'DEF', club: 'ARS', p: 5.2,  f: 6.1, tp: 104, own: 41.2, gw: 9 },
    { id: 'trakowski', name: 'Trakowski',    pos: 'DEF', club: 'NEW', p: 6.7,  f: 5.0, tp: 88,  own: 14.0, gw: 6 },
    { id: 'senesi',    name: 'Senesi',       pos: 'DEF', club: 'BOU', p: 5.5,  f: 4.6, tp: 72,  own: 8.9,  gw: 2 },
    { id: 'doku',      name: 'Doku',         pos: 'MID', club: 'MCI', p: 13.1, f: 8.6, tp: 168, own: 57.9, gw: 13 },
    { id: 'bruno',     name: 'B. Fernandes', pos: 'MID', club: 'MUN', p: 10.8, f: 6.4, tp: 96,  own: 18.2, gw: 7 },
    { id: 'saka',      name: 'Saka',         pos: 'MID', club: 'ARS', p: 9.0,  f: 7.2, tp: 131, own: 38.6, gw: 8, vice: true },
    { id: 'palmer',    name: 'Palmer',       pos: 'MID', club: 'CHE', p: 5.8,  f: 6.9, tp: 124, own: 33.0, gw: 5 },
    { id: 'haaland',   name: 'Haaland',      pos: 'FWD', club: 'MCI', p: 14.2, f: 9.1, tp: 175, own: 62.3, gw: 16, capt: true },
    { id: 'watkins',   name: 'Watkins',      pos: 'FWD', club: 'AVL', p: 8.9,  f: 6.0, tp: 99,  own: 19.4, gw: 8 },
    { id: 'solanke',   name: 'Solanke',      pos: 'FWD', club: 'TOT', p: 7.1,  f: 5.2, tp: 84,  own: 10.8, gw: 6 },
  ],
  bench: [
    { id: 'henderson', name: 'Henderson', pos: 'GKP', club: 'CRY', p: 3.9, f: 3.9, tp: 40, own: 1.8, gw: 1 },
    { id: 'truffert',  name: 'Truffert',  pos: 'DEF', club: 'BOU', p: 4.0, f: 4.0, tp: 64, own: 5.1, gw: 1 },
    { id: 'odango',    name: 'O.Dango',   pos: 'MID', club: 'BRE', p: 4.4, f: 4.1, tp: 42, own: 3.2, gw: 2 },
    { id: 'lacroix',   name: 'Lacroix',   pos: 'DEF', club: 'CRY', p: 3.8, f: 3.8, tp: 58, own: 2.7, gw: 2 },
  ],
};

// ─── Top Picks ────────────────────────────────────────────────────────────────

export const TOP_PICKS: Record<Position, TopPickPlayer[]> = {
  GKP: [
    { name: 'Raya',       club: 'ARS', p: 5.6, f: 4.8, tp: 92,  own: 28.4, gw: 6 },
    { name: 'Sánchez',    club: 'CHE', p: 5.1, f: 4.5, tp: 84,  own: 19.2, gw: 5 },
    { name: 'Sels',       club: 'NFO', p: 5.0, f: 4.2, tp: 78,  own: 22.5, gw: 3 },
    { name: 'Pope',       club: 'NEW', p: 5.3, f: 4.4, tp: 81,  own: 14.0, gw: 6 },
    { name: 'Pickford',   club: 'EVE', p: 5.4, f: 4.1, tp: 79,  own: 12.8, gw: 2 },
    { name: 'Petrović',   club: 'BOU', p: 4.6, f: 4.6, tp: 76,  own: 9.1,  gw: 7 },
    { name: 'Verbruggen', club: 'BHA', p: 4.5, f: 3.8, tp: 68,  own: 6.4,  gw: 3 },
  ],
  DEF: [
    { name: 'Gabriel',   club: 'ARS', p: 6.3, f: 6.1, tp: 104, own: 41.2, gw: 9 },
    { name: 'Saliba',    club: 'ARS', p: 6.1, f: 5.4, tp: 88,  own: 24.8, gw: 6 },
    { name: 'Van Dijk',  club: 'LIV', p: 6.4, f: 5.0, tp: 81,  own: 18.1, gw: 2 },
    { name: 'Porro',     club: 'TOT', p: 5.5, f: 5.6, tp: 86,  own: 21.3, gw: 8 },
    { name: 'Gvardiol',  club: 'MCI', p: 6.0, f: 4.6, tp: 72,  own: 14.9, gw: 2 },
    { name: 'Hall',      club: 'NEW', p: 5.2, f: 4.9, tp: 76,  own: 11.3, gw: 6 },
    { name: 'Andersen',  club: 'FUL', p: 4.6, f: 5.1, tp: 74,  own: 8.7,  gw: 7 },
    { name: 'Muñoz',     club: 'CRY', p: 5.0, f: 5.5, tp: 83,  own: 17.6, gw: 9 },
  ],
  MID: [
    { name: 'Salah',        club: 'LIV', p: 14.3, f: 8.6, tp: 168, own: 57.9, gw: 13 },
    { name: 'Saka',         club: 'ARS', p: 10.4, f: 7.2, tp: 131, own: 38.6, gw: 8 },
    { name: 'Palmer',       club: 'CHE', p: 10.6, f: 6.9, tp: 124, own: 33.0, gw: 5 },
    { name: 'Mbeumo',       club: 'MUN', p: 8.3,  f: 7.0, tp: 118, own: 29.4, gw: 11 },
    { name: 'B. Fernandes', club: 'MUN', p: 9.1,  f: 6.4, tp: 112, own: 21.7, gw: 7 },
    { name: 'Son',          club: 'TOT', p: 9.8,  f: 6.2, tp: 108, own: 19.0, gw: 6 },
    { name: 'Semenyo',      club: 'BOU', p: 7.2,  f: 6.8, tp: 106, own: 24.2, gw: 10 },
    { name: 'Rogers',       club: 'AVL', p: 7.1,  f: 5.8, tp: 86,  own: 16.7, gw: 5 },
  ],
  FWD: [
    { name: 'Haaland',   club: 'MCI', p: 14.6, f: 9.1, tp: 175, own: 62.3, gw: 16 },
    { name: 'Wood',      club: 'NFO', p: 7.5,  f: 6.7, tp: 101, own: 26.1, gw: 9 },
    { name: 'Watkins',   club: 'AVL', p: 9.0,  f: 6.0, tp: 99,  own: 19.4, gw: 8 },
    { name: 'João Pedro',club: 'CHE', p: 7.8,  f: 6.5, tp: 97,  own: 22.0, gw: 7 },
    { name: 'Jackson',   club: 'CHE', p: 7.6,  f: 5.4, tp: 88,  own: 12.3, gw: 4 },
    { name: 'Solanke',   club: 'TOT', p: 7.4,  f: 5.2, tp: 84,  own: 10.8, gw: 6 },
    { name: 'Cunha',     club: 'MUN', p: 6.9,  f: 5.9, tp: 90,  own: 15.5, gw: 8 },
  ],
};

// ─── Chips ────────────────────────────────────────────────────────────────────

export const CHIPS: Chip[] = [
  { id: 'wc', name: 'Wildcard',       sub: 'Unlimited transfers',  available: true,  icon: 'wildcard' },
  { id: 'fh', name: 'Free Hit',       sub: 'One-week squad',       available: true,  icon: 'freehit' },
  { id: 'bb', name: 'Bench Boost',    sub: 'All 15 players score', available: false, playedGW: 12, icon: 'benchboost' },
  { id: 'tc', name: 'Triple Captain', sub: '3× captain points',    available: true,  icon: 'triplecaptain' },
];

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export const FIXTURES: Partial<Record<ClubCode, Fixture>> = {
  ARS: { opp: 'LIV', h: true },  LIV: { opp: 'ARS', h: false },
  MCI: { opp: 'CHE', h: true },  CHE: { opp: 'MCI', h: false },
  MUN: { opp: 'TOT', h: true },  TOT: { opp: 'MUN', h: false },
  NEW: { opp: 'NFO', h: false }, NFO: { opp: 'NEW', h: true },
  AVL: { opp: 'BHA', h: true },  BHA: { opp: 'AVL', h: false },
  BOU: { opp: 'WOL', h: true },  WOL: { opp: 'BOU', h: false },
  CRY: { opp: 'EVE', h: true },  EVE: { opp: 'CRY', h: false },
  FUL: { opp: 'BRE', h: true },  BRE: { opp: 'FUL', h: false },
};

// ─── APEX_TEAM ────────────────────────────────────────────────────────────────

export const APEX_TEAM = {
  teamName: 'Apex Pitch FC',
  gw: 24,
  gwPts: 64,
  totalPoints: 1452,
  avgPoints: 52,
  highestPoints: 118,
  pitch: [
    [
      { name: 'Haaland',      pts: 12, capt: true },
      { name: 'Watkins',      pts: 5 },
      { name: 'Solanke',      pts: 2, ball: true },
    ],
    [
      { name: 'Doku',         pts: 8,  cards: ['yellow', 'red'] as ('yellow' | 'red')[] },
      { name: 'B. Fernandes', pts: 18 },
      { name: 'Saka',         pts: 6,  ball: true, sub: 80 },
      { name: 'Palmer',       pts: 3,  subIn: 65 },
    ],
    [
      { name: 'Gabriel',      pts: 6,  cards: ['yellow', 'red'] as ('yellow' | 'red')[] },
      { name: 'Trakowski',    pts: 1,  cards: ['red'] as ('yellow' | 'red')[] },
      { name: 'Senesi',       pts: 2,  cards: ['yellow'] as ('yellow' | 'red')[] },
    ],
    [
      { name: 'Raya',         pts: 1 },
    ],
  ] as PitchPlayer[][],
  bench: [
    { name: 'Henderson', pts: 0,    gk: true },
    { name: 'Truffert',  pts: 1 },
    { name: 'O.Dango',   pts: 0 },
    { name: 'Lacroix',   pts: null, alert: true },
  ] as PitchPlayer[],
  captainPicks: [
    { name: 'Haaland', club: 'MCI' as ClubCode, xp: 8.4, note: 'Home vs bottom-half defence' },
    { name: 'Salah',   club: 'LIV' as ClubCode, xp: 7.1, note: 'Penalties + strong away form' },
    { name: 'Saka',    club: 'ARS' as ClubCode, xp: 5.9, note: 'Returns from knock' },
  ] as CaptainPick[],
  captainApplied: 'Haaland',
  suggestions: [
    { id: 's2', type: 'sub' as const, text: 'Sub in Turner for Areola', detail: 'Areola is a doubt — knock in training',  gain: '+2 xPts', wasApplied: false },
    { id: 's3', type: 'sub' as const, text: 'Bench Walker for Taylor',  detail: 'Walker rotation risk vs Liverpool',      gain: '+1 xPts', wasApplied: true },
  ] as Suggestion[],
  transfer: {
    freeTransfers: 1,
    squadValue: 102.5,
    inBank: 2.4,
    nextGw: 25,
    deadline: 'Sat 11:00AM PST',
    captain: { first: 'Erling', last: 'Haaland', num: 8 },
    transferSuggestions: [
      { id: 't1', out: 'Walker',  outClub: 'MCI' as ClubCode, in: 'Muñoz',  inClub: 'CRY' as ClubCode, detail: 'Walker rotation risk · Muñoz nailed with attacking returns', gain: '+6 xPts' },
      { id: 't2', out: 'Solanke', outClub: 'TOT' as ClubCode, in: 'Mateta', inClub: 'CRY' as ClubCode, detail: 'Kinder fixtures and on penalties for Palace',               gain: '+4 xPts' },
      { id: 't3', out: 'O.Dango', outClub: 'BRE' as ClubCode, in: 'Rogers', inClub: 'AVL' as ClubCode, detail: 'Frees £2.7m and adds a starting midfielder',               gain: '+3 xPts' },
    ] as TransferSuggestion[],
    chips: [
      { name: 'Wildcard',    status: 'Available',  state: 'active' as const, tip: { title: "Gaffer's Tip",  lines: ['Hold for GW28 — five doubles land that week', 'Rebuild around Arsenal & City assets'] } },
      { name: 'Free Hit',    status: 'Used GW 12', state: 'used'   as const, playedGw: 12 },
      { name: 'Triple Capt', status: 'Available',  state: 'idle'   as const, tip: { title: "Gaffer's Tip",  lines: ['GW30 with Haaland as captain', 'GW32 with Salah as captain'] } },
      { name: 'Bench Boost', status: 'Available',  state: 'idle'   as const, tip: { title: "Gaffer agrees!", lines: ['Your bench is stacked for GW29', 'All 15 have home fixtures'] } },
    ] as TransferChip[],
    pitch: [
      [
        { name: 'Haaland',      p: 14.2, pos: 'FWD' as Position, club: 'MCI' as ClubCode, tp: 175, f: 9.1, own: 62.3, gw: 16, capt: true },
        { name: 'Watkins',      p: 8.9,  pos: 'FWD' as Position, club: 'AVL' as ClubCode, tp: 99,  f: 6.0, own: 19.4, gw: 8 },
        { name: 'Solanke',      p: 7.1,  pos: 'FWD' as Position, club: 'TOT' as ClubCode, tp: 84,  f: 5.2, own: 10.8, gw: 6 },
      ],
      [
        { name: 'Doku',         p: 13.1, pos: 'MID' as Position, club: 'MCI' as ClubCode, tp: 168, f: 8.6, own: 57.9, gw: 13 },
        { name: 'B. Fernandes', p: 10.8, pos: 'MID' as Position, club: 'MUN' as ClubCode, tp: 96,  f: 6.4, own: 18.2, gw: 7 },
        { name: 'Saka',         p: 9.0,  pos: 'MID' as Position, club: 'ARS' as ClubCode, tp: 131, f: 7.2, own: 38.6, gw: 8 },
        { name: 'Palmer',       p: 5.8,  pos: 'MID' as Position, club: 'CHE' as ClubCode, tp: 124, f: 6.9, own: 33.0, gw: 5 },
        { name: 'O.Dango',      p: 4.4,  pos: 'MID' as Position, club: 'BRE' as ClubCode, tp: 42,  f: 4.1, own: 3.2,  gw: 2 },
      ],
      [
        { name: 'Gabriel',      p: 5.2,  pos: 'DEF' as Position, club: 'ARS' as ClubCode, tp: 104, f: 6.1, own: 41.2, gw: 9 },
        { name: 'Trakowski',    p: 6.7,  pos: 'DEF' as Position, club: 'NEW' as ClubCode, tp: 88,  f: 5.0, own: 14.0, gw: 6 },
        { name: 'Senesi',       p: 5.5,  pos: 'DEF' as Position, club: 'BOU' as ClubCode, tp: 72,  f: 4.6, own: 8.9,  gw: 2 },
        { name: 'Truffert',     p: 4.0,  pos: 'DEF' as Position, club: 'BOU' as ClubCode, tp: 64,  f: 4.0, own: 5.1,  gw: 1 },
        { name: 'Lacroix',      p: 3.8,  pos: 'DEF' as Position, club: 'CRY' as ClubCode, tp: 58,  f: 3.8, own: 2.7,  gw: 2 },
      ],
      [
        { name: 'Raya',         p: 4.2,  pos: 'GKP' as Position, club: 'ARS' as ClubCode, tp: 78,  f: 4.2, own: 9.1,  gw: 3 },
        { name: 'Henderson',    p: 3.9,  pos: 'GKP' as Position, club: 'CRY' as ClubCode, tp: 40,  f: 3.9, own: 1.8,  gw: 1 },
      ],
    ] as TransferPitchPlayer[][],
  },
};

// ─── Team Info ────────────────────────────────────────────────────────────────

export const TEAM_INFO: TeamInfo = {
  name: 'Apex Pitch FC',
  gw: 24,
  gwPoints: 64,
  totalPoints: 1452,
  rank: 142_831,
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  email: string;
  faceId: boolean;
}

export const PROFILE: Profile = {
  firstName: 'Apex',
  lastName: 'Gaffer',
  dob: '14 Aug 1990',
  gender: 'Prefer not to say',
  email: 'apex.gaffer@example.com',
  faceId: true,
};
