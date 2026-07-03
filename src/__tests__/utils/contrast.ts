// WCAG relative-luminance contrast ratio. Test-only helper (no runtime consumer,
// so it lives with the tests). Supports "#rgb" / "#rrggbb" / "#rrggbbaa" and
// "rgb()/rgba()"; a translucent fg is composited over the opaque bg first.
type RGB = [number, number, number];

function composite(fg: RGB, a: number, bg: RGB): RGB {
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
  ];
}

function parse(color: string, bg?: RGB): RGB {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    const rgb: RGB = [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16),
    ];
    const a = n.length === 8 ? parseInt(n.slice(6, 8), 16) / 255 : 1;
    return a < 1 && bg ? composite(rgb, a, bg) : rgb;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Unparseable colour: ${color}`);
  const p = m[1].split(',').map((s) => parseFloat(s.trim()));
  const a = p[3] === undefined ? 1 : p[3];
  const rgb: RGB = [p[0], p[1], p[2]];
  return a < 1 && bg ? composite(rgb, a, bg) : rgb;
}

function luminance([r, g, b]: RGB): number {
  const f = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

// Contrast ratio of `fg` over opaque `bg` (1..21). A translucent `fg` is
// composited over `bg` before measuring.
export function contrastRatio(fg: string, bg: string): number {
  const bgRgb = parse(bg);
  const fgRgb = parse(fg, bgRgb);
  const L1 = luminance(fgRgb);
  const L2 = luminance(bgRgb);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
