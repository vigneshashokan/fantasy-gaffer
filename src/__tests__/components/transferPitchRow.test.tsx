import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { TransferPitch } from '@/components/transfer/TransferPitch';
import { GUTTER } from '@/constants/theme';
import type { Position, TransferPitchPlayer } from '@/types/fpl';

// jest's default window is far wider than any phone, so every cap would clamp
// to PILL_MAX there. 320pt is a real handset under iOS Display Zoom — the
// narrowest width the app supports, where every cap here is at its tightest.
const W = 320;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 320, height: 693, scale: 3, fontScale: 1 }),
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
const slots = (r: ReturnType<typeof render>) =>
  r.getAllByTestId('transfer-slot').map((n) => StyleSheet.flatten(n.props.style));

describe('TransferPitch name layout', () => {
  // The bug this file exists for: the card is a fixed slot wide, a name
  // measures itself against the nearest definite width above it, and a
  // `maxWidth` on the pill sits BELOW that constraint so it can never widen
  // one. Every name in the squad truncated to a jersey's width.
  it('measures the name against a box wider than the slot it sits in', () => {
    const r = render(<TransferPitch rows={[row(5)]} />);
    const slot = slots(r)[0].width as number;
    for (const p of pills(r)) expect(p.width).toBeGreaterThan(slot);
  });

  // Five names cannot fit five slots on one line, so alternate players drop
  // onto a second plane — the whole card, price pill included, the way the My
  // Team pitch does it.
  it('drops the 2nd and 4th card of a five-wide row', () => {
    expect(slots(render(<TransferPitch rows={[row(5)]} />)).map((s) => s.marginTop ?? 0))
      .toEqual([0, 30, 0, 30, 0]);
  });

  it('leaves a three-wide row on one plane, and caps it at one share', () => {
    const r = render(<TransferPitch rows={[row(3, 'FWD')]} />);
    const p = pills(r);
    expect(slots(r).every((s) => !s.marginTop)).toBe(true);
    // One plane means a pill stops at its neighbour, so no cap may exceed the
    // spacing between slot centres — the row is 390 less its side chrome.
    const share = (W - (GUTTER + 2 + 16) * 2) / 3;
    for (const s of p) expect(s.width).toBeLessThanOrEqual(share);
  });

  // The regression that put the jerseys out of line: the price sat in the fixed
  // slot too, so `£15.5m` wrapped onto two lines and pushed that one card's
  // jersey below its neighbours'. Six characters of JetBrains Mono 12 run ~42pt,
  // plus the pill's 20pt of padding.
  it('gives the price enough room that six characters cannot wrap', () => {
    for (const rows of [[row(5)], [row(3, 'FWD')], [row(2, 'GKP')]]) {
      const r = render(<TransferPitch rows={rows} />);
      for (const box of r.getAllByTestId('transfer-price-row')) {
        expect(StyleSheet.flatten(box.props.style).width).toBeGreaterThanOrEqual(62);
      }
    }
  });

  it('fits a full row inside the pitch alongside its edge padding', () => {
    const r = render(<TransferPitch rows={[row(5)]} />);
    const pitchPad = StyleSheet.flatten((r.toJSON() as any).props.style)
      .paddingHorizontal as number;
    const rowPad = StyleSheet.flatten(r.getByTestId('transfer-row').props.style)
      .paddingHorizontal as number;
    const widths = slots(r).map((s) => s.width as number);

    expect(rowPad).toBeGreaterThan(0);
    const used = widths.reduce((a, b) => a + b, 0) + rowPad * 2;
    expect(used).toBeLessThanOrEqual(W - GUTTER * 2 - pitchPad * 2);
  });
});
