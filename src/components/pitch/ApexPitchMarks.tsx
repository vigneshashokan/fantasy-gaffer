import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Rect, Path, Circle, Line } from 'react-native-svg';

interface ApexPitchMarksProps {
  width: number;
  height: number;
}

// Half pitch, drawn attacking upwards: the top edge of the rectangle IS the
// halfway line, and the centre circle straddles it — so the rectangle starts a
// circle-radius down the card and the crown of the circle takes the top inset
// that every other edge gets. Everything else is a fraction of the rectangle,
// so it all scales with whatever onLayout reports.
//   centre circle r = 9.15m       → 14.5% of pitch WIDTH, and round (see below)
//   penalty area  40.32m × 16.5m  → 54% × 27%
//   goal area     18.32m × 5.5m   → 28% × 11%
//   penalty spot  11m from goal   → 20% of pitch height
//   D arc         r = 9.15m       → 30% of pitch width
//   goal mouth    7.32m           → 11.4% of pitch width
const CIRCLE_R = 0.145;

export function ApexPitchMarks({ width: W, height: H }: ApexPitchMarksProps) {
  if (W <= 0 || H <= 0) return null;

  const stroke = {
    fill: 'none' as const,
    stroke: '#fff',
    strokeWidth: 1,
    strokeOpacity: 0.5,
  };

  const inset = Math.min(W, H) * 0.025;
  const iw = W - inset * 2;
  // A TRUE circle, so the radius is a fraction of the WIDTH alone. The drawn
  // pitch is far taller than a real half pitch — the squad needs the room — so
  // taking the vertical radius off the height, as the real-world 9.15m/52.5m
  // ratio invites, stretched the centre circle into a tall oval.
  const circleR = iw * CIRCLE_R;
  // The rectangle's top edge is the halfway line and the circle straddles it,
  // so the circle's upper half takes the top inset and the rectangle gets what
  // is left. Floored so an extreme aspect ratio can't hand <Rect> a negative.
  const ih = Math.max(1, H - inset * 2 - circleR);
  const top = H - inset - ih;

  const penaltyW = iw * 0.54;
  const penaltyH = ih * 0.27;
  const penaltyX = inset + (iw - penaltyW) / 2;
  const penaltyY = top + ih - penaltyH;

  const goalAreaW = iw * 0.28;
  const goalAreaH = ih * 0.108;
  const goalAreaX = inset + (iw - goalAreaW) / 2;
  const goalAreaY = top + ih - goalAreaH;

  const penaltySpotY = top + ih - ih * 0.2;
  const spotR = Math.max(1.2, Math.min(W, H) * 0.008);

  const dArcW = iw * 0.3;
  const dArcH = ih * 0.09;

  const goalLineW = iw * 0.114;
  const goalLineX = inset + (iw - goalLineW) / 2;
  const goalLineY = top + ih;

  return (
    // width/height are load-bearing, not redundant with absoluteFill. Left off,
    // react-native-svg defaults them to '100%', which Yoga resolves against the
    // pitch's CONTENT box while `position: absolute` anchors the view to its
    // border box — so the overlay came up short by exactly the pitch's padding
    // (12pt of it on the right, 48 at the bottom) and every marking drifted up
    // and left, leaving the keeper standing outside his own goal line.
    <Svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
    >
      {/* outline — its top edge is the halfway line */}
      <Rect x={inset} y={top} width={iw} height={ih} {...stroke} />

      {/* centre circle, half of it in the opponent's half we don't draw */}
      <Circle testID="centre-circle" cx={W / 2} cy={top} r={circleR} {...stroke} />
      <Circle cx={W / 2} cy={top} r={spotR} fill="#fff" fillOpacity={0.5} stroke="none" />

      {/* penalty area */}
      <Rect x={penaltyX} y={penaltyY} width={penaltyW} height={penaltyH} {...stroke} />

      {/* goal area (6-yard box) */}
      <Rect x={goalAreaX} y={goalAreaY} width={goalAreaW} height={goalAreaH} {...stroke} />

      {/* penalty spot */}
      <Circle cx={W / 2} cy={penaltySpotY} r={spotR} fill="#fff" fillOpacity={0.5} stroke="none" />

      {/* penalty D — arc protruding upward from the top of the penalty area */}
      <Path
        d={`M ${W / 2 - dArcW / 2} ${penaltyY} A ${dArcW / 2} ${dArcH} 0 0 1 ${W / 2 + dArcW / 2} ${penaltyY}`}
        {...stroke}
      />

      {/* goal mouth */}
      <Line
        x1={goalLineX}
        y1={goalLineY}
        x2={goalLineX + goalLineW}
        y2={goalLineY}
        stroke="#fff"
        strokeOpacity={0.6}
        strokeWidth={2.5}
      />
    </Svg>
  );
}
