import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ApexPitch } from '@/components/pitch/ApexPitch';
import { ApexPitchMarks } from '@/components/pitch/ApexPitchMarks';
import { GUTTER } from '@/constants/theme';
import type { PitchPlayer } from '@/types/fpl';

// jest's default window is far wider than any phone, and every pill cap would
// clamp to PILL_MAX there — pin a real handset width so the caps mean something.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

// A five-wide row of names long enough that every pill outgrows its slot —
// the case that used to push the last player off the right edge of the pitch.
const row = (n: number): PitchPlayer[] =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: 'B.Fernandes',
    pts: 2,
    club: 'MUN',
  }));

const slots = (n: number) =>
  render(<ApexPitch rows={[row(n)]} />)
    .getAllByTestId('pitch-slot')
    .map((s) => StyleSheet.flatten(s.props.style));

describe('ApexPitch row layout', () => {
  it('gives every slot a fixed width, so a long name cannot widen the row', () => {
    for (const s of slots(5)) {
      expect(s.width).toBeGreaterThan(0);
      expect(s.minWidth).toBeUndefined();
    }
  });

  it('drops the 2nd and 4th of a five-wide row onto a lower plane', () => {
    expect(slots(5).map((s) => s.marginTop ?? 0)).toEqual([0, 30, 0, 30, 0]);
  });

  it('leaves a four-wide row on one plane', () => {
    expect(slots(4).every((s) => !s.marginTop)).toBe(true);
  });

  // The pitch knows nothing about position — it staggers by row length — so a
  // 5-3-2's back line splits the same way a 3-5-2's midfield does, and only
  // the row that needs it does.
  it('staggers a five-DEF back line and leaves the rest of a 5-3-2 alone', () => {
    const drops = render(<ApexPitch rows={[row(5), row(3), row(2)]} />)
      .getAllByTestId('pitch-slot')
      .map((s) => StyleSheet.flatten(s.props.style).marginTop ?? 0);
    expect(drops).toEqual([0, 30, 0, 30, 0, 0, 0, 0, 0, 0]);
  });
});

describe('ApexPitch row geometry', () => {
  // The one that breaks in silence. `space-around` fixes the first slot's
  // centre at half a share whatever the slot width, so the only thing holding
  // an outer pill off the pitch edge is the row's own padding — and the slots
  // have to be sized for what that padding leaves, or a full row runs over.
  // A name measures itself against the nearest definite width above it. The
  // card is one (it has to be, or the row overflows), so unless the pill row
  // carries its own the whole squad truncates to a jersey's width.
  it('measures the name against the pill row, not the slot it sits in', () => {
    const r = render(<ApexPitch rows={[row(5)]} />);
    const slot = StyleSheet.flatten(r.getAllByTestId('pitch-slot')[2].props.style)
      .width as number;
    const box = StyleSheet.flatten(r.getAllByTestId('pill-row')[2].props.style)
      .width as number;
    expect(box).toBeGreaterThan(slot);
  });

  it('fits a full row inside the pitch alongside its edge padding', () => {
    const r = render(<ApexPitch rows={[row(5)]} />);
    const pitchPad = StyleSheet.flatten((r.toJSON() as any).props.style)
      .paddingHorizontal as number;
    const rowPad = StyleSheet.flatten(r.getByTestId('pitch-row').props.style)
      .paddingHorizontal as number;
    const slots = r.getAllByTestId('pitch-slot')
      .map((s) => StyleSheet.flatten(s.props.style).width as number);

    expect(rowPad).toBeGreaterThan(0);
    const used = slots.reduce((a, b) => a + b, 0) + rowPad * 2;
    expect(used).toBeLessThanOrEqual(390 - GUTTER * 2 - pitchPad * 2);
  });
});

describe('ApexPitchMarks', () => {
  // Without an explicit size the SVG viewport is the pitch's content box while
  // its origin is the border box, so every marking drifts up and left by the
  // padding. Nothing in the markings themselves looks wrong when that happens,
  // which is why it stood for so long — pin the viewport instead.
  it('sizes its viewport to the whole pitch, padding included', () => {
    const svg = render(<ApexPitchMarks width={340} height={420} />).toJSON() as any;
    expect(svg.props.bbWidth).toBe(340);
    expect(svg.props.bbHeight).toBe(420);
  });

  it('draws nothing before the pitch has been measured', () => {
    expect(render(<ApexPitchMarks width={0} height={0} />).toJSON()).toBeNull();
  });
});
