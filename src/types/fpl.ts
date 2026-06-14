// src/types/fpl.ts
//
// All UI-facing shape types for FPL data. Hooks in src/api/ return these
// shapes; screens import types from here, never from src/constants/data.ts.

export type ClubCode =
  | 'ARS' | 'LIV' | 'MCI' | 'CHE' | 'MUN' | 'NEW' | 'TOT'
  | 'AVL' | 'NFO' | 'BHA' | 'BOU' | 'BRE' | 'CRY' | 'EVE'
  | 'WOL' | 'FUL' | 'WHU';

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

export type PlayerStatus = 'a' | 'i' | 'd' | 'u' | 's' | 'n';

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
  status: PlayerStatus;
  news: string;
  chanceNext: number | null;
  ict: number;
  bps: number;
  capt?: boolean;
  vice?: boolean;
  sub?: number;
  subIn?: number;
}

export interface TopPickPlayer {
  id: string;
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
  id: string;
  name: string;
  pts: number | null;
  club?: ClubCode;
  capt?: boolean;
  vice?: boolean;
  ball?: boolean;
  sub?: number;
  subIn?: number;
  cards?: Array<'yellow' | 'red'>;
  gk?: boolean;
  alert?: boolean;
}

export interface TransferPitchPlayer {
  id: string;
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

export interface Profile {
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  faceId: boolean;
  fplTeamId: number | null;
}
