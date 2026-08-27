import React from 'react';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';

export type IconName =
  | 'chevL' | 'chevR' | 'arrowR' | 'arrowUp' | 'arrowDown' | 'check'
  | 'mail' | 'lock' | 'swap' | 'team'
  | 'fire' | 'google' | 'apple' | 'faceid'
  | 'person' | 'gear' | 'signOut'
  | 'eye' | 'eyeOff' | 'pencil'
  | 'sun' | 'moon' | 'device'
  | 'wildcard' | 'bolt' | 'benchBoost' | 'captain';

interface IconProps {
  name: IconName;
  color?: string;
  size?: number;
}

// Keyed by name so swapping the icon in one slot (pencil <-> check on the
// profile name rows, eye <-> eyeOff in the password field) REMOUNTS instead of
// re-propping the native SVG views. react-native-svg does not re-apply the
// <Svg> root's inherited fill/stroke to a reused <Path>, so any glyph whose
// paths rely on that inheritance came back with SVG's default BLACK fill — the
// profile pencil rendered as a solid black blob after a tick had stood there.
export function Icon({ name, color = '#fff', size = 20 }: IconProps) {
  return <Glyph key={name} name={name} color={color} size={size} />;
}

function Glyph({ name, color, size }: Required<IconProps>) {
  const s = size;
  switch (name) {
    case 'chevL':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'chevR':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M9 5l7 7-7 7" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'arrowR':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M4 12h15M13 5l7 7-7 7" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'arrowUp':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M12 19V5M5 12l7-7 7 7" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'arrowDown':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M12 5v14M5 12l7 7 7-7" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'check':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 6.5" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'mail':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Rect x="3" y="5" width="18" height="14" rx="3" stroke={color} strokeWidth="2" fill="none" /><Path d="M4 7l8 6 8-6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'lock':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke={color} strokeWidth="2" fill="none" /><Path d="M8 10.5V8a4 4 0 018 0v2.5" stroke={color} strokeWidth="2" fill="none" /></Svg>;
    case 'swap':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M7 4L3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'team':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Circle cx="9" cy="8.5" r="3" stroke={color} strokeWidth="2" fill="none" /><Path d="M3.5 19.5a5.5 5.5 0 0111 0" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" /><Path d="M16 6.2a3 3 0 010 5.6M17.5 14.2a5.5 5.5 0 013 4.9" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" /></Svg>;
    case 'fire':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M12 3c1 3 4 4.2 4 8a4 4 0 11-8 0c0-1.4.5-2.3 1-3 .2 1 .8 1.6 1.5 1.8C10 8 10.5 5 12 3z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill="none" /></Svg>;
    case 'google':
      return (
        <Svg width={s} height={s} viewBox="0 0 48 48">
          <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 110-24c3.1 0 5.8 1.1 8 3l5.7-5.7A20 20 0 1044 24c0-1.2-.1-2.4-.4-3.5z" />
          <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8A12 12 0 0124 12c3.1 0 5.8 1.1 8 3l5.7-5.7A20 20 0 006.3 14.7z" />
          <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0124 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 01-4.1 5.6l6.2 5.2C39.8 35.5 44 30.5 44 24c0-1.2-.1-2.4-.4-3.5z" />
        </Svg>
      );
    case 'apple':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path fill={color} d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.9-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2-.05 1.6-.75 3-.75s1.8.75 3 .73c1.2-.02 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.03-.01-2.5-1-2.5-3.9zM14.2 5.6c.65-.8 1.1-1.9.97-3-.94.04-2.1.63-2.77 1.42-.6.7-1.13 1.83-.99 2.9 1.05.08 2.13-.53 2.79-1.32z" /></Svg>;
    case 'faceid':
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M4 8V6.5A2.5 2.5 0 016.5 4H8M16 4h1.5A2.5 2.5 0 0120 6.5V8M20 16v1.5a2.5 2.5 0 01-2.5 2.5H16M8 20H6.5A2.5 2.5 0 014 17.5V16" /><Path d="M9 9.5v1M15 9.5v1M12 9v3l-1 1" /><Path d="M9 14.5s1 1.2 3 1.2 3-1.2 3-1.2" /></Svg>;
    case 'sun':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="4.2" stroke={color} strokeWidth="2" fill="none" /><Path d="M12 2.4v2.1M12 19.5v2.1M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2.4 12h2.1M19.5 12h2.1M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" /></Svg>;
    case 'moon':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M20.8 13.1A8.6 8.6 0 1110.9 3.2a6.7 6.7 0 009.9 9.9z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    // A handset, for "whatever the device is set to".
    case 'device':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Rect x="6.5" y="2.5" width="11" height="19" rx="2.6" stroke={color} strokeWidth="2" fill="none" /><Path d="M10.4 18.6h3.2" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" /></Svg>;
    case 'person':
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="8" r="3.6" stroke={color} strokeWidth="2" /><Path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" stroke={color} strokeWidth="2" strokeLinecap="round" /></Svg>;
    case 'gear':
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Circle cx="12" cy="12" r="3" /><Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></Svg>;
    case 'signOut':
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><Path d="M16 17l5-5-5-5" /><Path d="M21 12H9" /></Svg>;
    case 'eye':
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><Circle cx="12" cy="12" r="3" /></Svg>;
    case 'eyeOff':
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M17.94 17.94A10 10 0 0112 20c-7 0-11-8-11-8a18 18 0 014.06-5.5" /><Path d="M9.9 4.24A10 10 0 0112 4c7 0 11 8 11 8a17 17 0 01-2.16 3.18" /><Path d="M1 1l22 22" /><Path d="M14.12 14.12a3 3 0 11-4.24-4.24" /></Svg>;
    case 'pencil':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M4 20h4l10-10a2.8 2.8 0 10-4-4L4 16v4z" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><Path d="M13.5 6.5l4 4" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" /></Svg>;
    // The four chip glyphs: rebuild the squad (wildcard), a one-week strike
    // (free hit), lifted off the bench (bench boost), the captain's armband
    // (triple captain). Not in the mock, which draws the chip tiles bare.
    case 'wildcard':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M20 12a8 8 0 11-2.6-5.9" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none" /><Path d="M20 3.5v4.2h-4.2" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'bolt':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M13 2.5L4.8 13.6h6.3l-1 7.9 9-11.2H13z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill="none" /></Svg>;
    case 'benchBoost':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M4 20.5h16" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none" /><Path d="M12 17V5.5M6.8 10.7L12 5.5l5.2 5.2" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'captain':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth="2" fill="none" /><Path d="M15 9.2a4.2 4.2 0 100 5.6" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" /></Svg>;
    default:
      return null;
  }
}
