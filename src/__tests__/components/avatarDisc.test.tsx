// The pitch fallback for a club we have no kit for.
//
// #218: five clubs were unmapped for a season and a half, so 26% of players
// rendered as an anonymous white person glyph on the green pitch — no club
// code, no colour, indistinguishable from a still-loading image. The wiring is
// fixed, but the fallback itself was the reason the gap read as "broken" rather
// than "unknown club", and it fires again the next time a club is promoted
// before we ship its art. Degrade legibly instead.
import React from 'react';
import { render } from '@testing-library/react-native';
import { Image } from 'react-native';
import { AvatarDisc } from '@/components/ui/AvatarDisc';
import type { ClubCode } from '@/types/fpl';

describe('AvatarDisc', () => {
  it('shows the club code when the club has no kit asset', () => {
    // Reachable at runtime whatever ClubCode says — codes come from Supabase
    // as plain strings, so a promoted club lands here before its art does.
    const { getByText } = render(
      <AvatarDisc player={{ name: 'Someone', club: 'WOL' as ClubCode }} />,
    );
    expect(getByText('WOL')).toBeTruthy();
  });

  it('renders the kit, and no code, for a club we do have', () => {
    const { queryByText, UNSAFE_getAllByType } = render(
      <AvatarDisc player={{ name: 'Haaland', club: 'MCI' }} />,
    );
    expect(queryByText('MCI')).toBeNull();
    expect(UNSAFE_getAllByType(Image).length).toBe(1);
  });

  it('falls back to the person glyph when there is no club at all', () => {
    const { queryByText } = render(<AvatarDisc player={{ name: 'Unknown' }} />);
    expect(queryByText('WOL')).toBeNull();
  });
});
