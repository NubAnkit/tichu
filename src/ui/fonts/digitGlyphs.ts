/**
 * Clearer "2" and "5" for the Arcade theme. Pixelify Sans draws both like an S.
 *
 * These reuse Pixelify's exact edge coordinates (read from its font files), so the
 * stroke weight, notched corners and spacing match its other digits:
 *   2 -> Pixelify's top and middle, but a flat, square bottom bar
 *   5 -> a flat, square top bar (no hook), Pixelify's middle and bottom
 * Each glyph is traced into one clean outline so it renders fully solid.
 *
 * Used by Card.tsx (inline SVG, works in every browser) and by
 * scripts/build-digit-font.ts (optional web font for running text).
 */

// Pixelify Sans edge coordinates (font units, 1000/em).
//   X: outer-left, left-notch, left-stem-inner, right-stem-inner, right-notch, outer-right
//   Y: bottom, bottom-notch, bottom-bar-top, low-hook-top, mid-bar-bottom, mid-notch-low,
//      mid-notch-high, mid-bar-top, top-hook-bottom, top-bar-bottom, top-notch, top
export const PIXELIFY = {
  400: { advance: 586, X: [60, 151, 161, 423, 433, 525], Y: [-12, 78, 88, 179, 260, 270, 350, 359, 440, 530, 540, 631] },
  700: { advance: 603, X: [61, 149, 188, 414, 453, 542], Y: [-11, 74, 125, 211, 246, 297, 331, 381, 416, 501, 552, 638] },
} as const;

/** Rectangles as [x-from, x-to, y-from, y-to] indices into X / Y. */
type R = [number, number, number, number];
export const DIGIT_RECTS: Record<string, R[]> = {
  '2': [
    [1, 4, 9, 11], // top bar (notched corners)
    [0, 2, 8, 10], // top-left hook
    [3, 5, 5, 10], // right stem down to the middle
    [1, 4, 4, 7], // middle bar (notched ends)
    [0, 2, 2, 6], // left stem down to the base
    [0, 5, 0, 2], // flat, square bottom bar
  ],
  '5': [
    [0, 5, 9, 11], // flat, square top bar
    [0, 2, 6, 9], // left stem down to the middle
    [0, 4, 4, 7], // middle bar, rounded shoulder on the right
    [3, 5, 1, 5], // right stem
    [1, 4, 0, 2], // bottom bar (notched corners)
    [0, 2, 1, 3], // bottom-left hook
  ],
};

/** Union the rectangles on the coordinate grid and trace the outline as closed loops (font units, y up). */
export function traceDigit(ch: string, weight: 400 | 700): [number, number][][] {
  const { X, Y } = PIXELIFY[weight];
  const rects = DIGIT_RECTS[ch];
  const W = X.length - 1;
  const H = Y.length - 1;
  const fill = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < W && j < H && rects.some(([x0, x1, y0, y1]) => i >= x0 && i < x1 && j >= y0 && j < y1);
  // directed boundary edges with the filled cell on the left (counter-clockwise outer loops)
  const edges = new Map<string, [number, number]>();
  for (let i = 0; i < W; i++)
    for (let j = 0; j < H; j++) {
      if (!fill(i, j)) continue;
      if (!fill(i, j - 1)) edges.set(`${i},${j}`, [i + 1, j]);
      if (!fill(i + 1, j)) edges.set(`${i + 1},${j}`, [i + 1, j + 1]);
      if (!fill(i, j + 1)) edges.set(`${i + 1},${j + 1}`, [i, j + 1]);
      if (!fill(i - 1, j)) edges.set(`${i},${j + 1}`, [i, j]);
    }
  const loops: [number, number][][] = [];
  while (edges.size) {
    const [startKey] = edges.keys();
    const loop: [number, number][] = [];
    let key = startKey;
    while (edges.has(key)) {
      const [a, b] = key.split(',').map(Number);
      loop.push([X[a], Y[b]]);
      const next = edges.get(key)!;
      edges.delete(key);
      key = `${next[0]},${next[1]}`;
    }
    loops.push(
      loop.filter((p, k) => {
        const prev = loop[(k - 1 + loop.length) % loop.length];
        const next = loop[(k + 1) % loop.length];
        return !((prev[0] === p[0] && p[0] === next[0]) || (prev[1] === p[1] && p[1] === next[1]));
      }),
    );
  }
  return loops;
}

/** SVG path data in a y-down frame whose origin is the glyph's top-left at the font's ascent. */
export function digitSvgPath(ch: string, weight: 400 | 700): string {
  const top = PIXELIFY[weight].Y[11];
  return traceDigit(ch, weight)
    .map((loop) => 'M' + loop.map(([x, y]) => `${x} ${top - y}`).join('L') + 'Z')
    .join('');
}
