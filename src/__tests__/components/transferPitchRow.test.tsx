import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { TransferPitch } from '@/components/transfer/TransferPitch';
import { GUTTER } from '@/constants/theme';
import type { Position, TransferPitchPlayer } from '@/types/fpl';

// jest's default window is far wider than any phone, so every cap would clamp
// to PILL_MAX there — pin a real handset width and the caps mean something.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

const row = (n: number, pos: Position = 'MID'): TransferPitchPlayer[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${pos}${i}`,
    name: 'B.Fernandes',
    p: 6.5,
    pos,
    club: 'MUN',
    tp: 12,
    f: 3,
    own: 20,
    gw: 2,
  }));

const pills = (r: ReturnType<typeof render>) =>
  r.getAllByTestId('transfer-pill-row').map((n) => StyleSheet.flatten(n.props.style));

describe('TransferPitch name layout', () => {
  // The bug this file exists for: the card is a fixed slot wide, a name
  // measures itself against the nearest definite width above it, and a
  // `maxWidth` on the pill sits BELOW that constraint so it can never widen
  // one. Every name in the squad truncated to a jersey's width.
  it('measures the name against a box wider than the slot it sits in', () => {
    const r = render(<TransferPitch rows={[row(5)]} />);
    const slot = StyleSheet.flatten(r.getAllByTestId('transfer-slot')[0].props.style)
      .width as number;
    for (const p of pills(r)) expect(p.width).toBeGreaterThan(slot);
  });

  // Five names cannot fit five slots on one line, so alternate names drop onto
  // a second plane. Only the NAME drops: the card carries a price pill above
  // its jersey, which staggering the whole card would land beside a neighbour.
  it('drops the 2nd and 4th name of a five-wide row', () => {
    expect(pills(render(<TransferPitch rows={[row(5)]} />)).map((p) => p.marginTop ?? 0))
      .toEqual([0, 22, 0, 22, 0]);
  });

  it('leaves a three-wide row on one plane, and caps it at one share', () => {
    const r = render(<TransferPitch rows={[row(3, 'FWD')]} />);
    const p = pills(r);
    expect(p.every((s) => !s.marginTop)).toBe(true);
    // One plane means a pill stops at its neighbour, so no cap may exceed the
    // spacing between slot centres — the row is 390 less its side chrome.
    const share = (390 - (GUTTER + 2 + 16) * 2) / 3;
    for (const s of p) expect(s.width).toBeLessThanOrEqual(share);
  });

  it('fits a full row inside the pitch alongside its edge padding', () => {
    const r = render(<TransferPitch rows={[row(5)]} />);
    const pitchPad = StyleSheet.flatten((r.toJSON() as any).props.style)
      .paddingHorizontal as number;
    const rowPad = StyleSheet.flatten(r.getByTestId('transfer-row').props.style)
      .paddingHorizontal as number;
    const slots = r.getAllByTestId('transfer-slot')
      .map((n) => StyleSheet.flatten(n.props.style).width as number);

    expect(rowPad).toBeGreaterThan(0);
    const used = slots.reduce((a, b) => a + b, 0) + rowPad * 2;
    expect(used).toBeLessThanOrEqual(390 - GUTTER * 2 - pitchPad * 2);
  });
});
