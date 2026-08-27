import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Rect, Path, Circle, Line } from 'react-native-svg';

interface ApexPitchMarksProps {
  width: number;
  height: number;
}

// Half pitch (64m × 50m). Markings expressed as fractions of the inner
// rectangle so they scale with whatever pitch dimensions onLayout reports.
//   penalty area  40.32m × 16.5m  → 63% × 33%
//   goal area     18.32m × 5.5m   → 28.6% × 11%
//   penalty spot  11m from goal   → 22% of pitch height
//   centre / D arc r = 9.15m      → 14.3% of pitch width
//   goal mouth    7.32m           → 11.4% of pitch width
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
  const ih = H - inset * 2;

  const penaltyW = iw * 0.63;
  const penaltyH = ih * 0.33;
  const penaltyX = inset + (iw - penaltyW) / 2;
  const penaltyY = inset + ih - penaltyH;

  const goalAreaW = iw * 0.286;
  const goalAreaH = ih * 0.11;
  const goalAreaX = inset + (iw - goalAreaW) / 2;
  const goalAreaY = inset + ih - goalAreaH;

  const penaltySpotY = inset + ih - ih * 0.22;
  const spotR = Math.max(1.2, Math.min(W, H) * 0.008);

  const centreArcW = iw * 0.30;
  const centreArcH = ih * 0.10;

  const dArcW = iw * 0.23;
  const dArcH = ih * 0.07;

  const goalLineW = iw * 0.114;
  const goalLineX = inset + (iw - goalLineW) / 2;
  const goalLineY = inset + ih;

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
      {/* outline */}
      <Rect x={inset} y={inset} width={iw} height={ih} {...stroke} />

      {/* centre arc — half ellipse dipping down from the top (halfway line) */}
      <Path
        d={`M ${W / 2 - centreArcW / 2} ${inset} A ${centreArcW / 2} ${centreArcH} 0 0 0 ${W / 2 + centreArcW / 2} ${inset}`}
        {...stroke}
      />
      <Circle cx={W / 2} cy={inset} r={spotR} fill="#fff" fillOpacity={0.5} stroke="none" />

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
