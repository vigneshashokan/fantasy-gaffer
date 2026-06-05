import React from 'react';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';

type IconName =
  | 'chevL' | 'chevR' | 'arrowR' | 'check'
  | 'mail' | 'lock' | 'swap' | 'team'
  | 'fire' | 'google' | 'apple' | 'faceid'
  | 'person' | 'gear' | 'signOut';

interface IconProps {
  name: IconName;
  color?: string;
  size?: number;
}

export function Icon({ name, color = '#fff', size = 20 }: IconProps) {
  const s = size;
  switch (name) {
    case 'chevL':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'chevR':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M9 5l7 7-7 7" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'arrowR':
      return <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M4 12h15M13 5l7 7-7 7" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
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
    case 'person':
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="8" r="3.6" stroke={color} strokeWidth="2" /><Path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" stroke={color} strokeWidth="2" strokeLinecap="round" /></Svg>;
    case 'gear':
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Circle cx="12" cy="12" r="3" /><Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></Svg>;
    case 'signOut':
      return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><Path d="M16 17l5-5-5-5" /><Path d="M21 12H9" /></Svg>;
    default:
      return null;
  }
}
