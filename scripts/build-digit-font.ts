/**
 * Builds src/ui/fonts/tichu-digits-{400,700}.otf: a tiny font containing only a
 * clearer "2" and "5" for the Arcade theme, layered over Pixelify Sans with
 * unicode-range. Pixelify's own 2 and 5 look like an S.
 *
 * The glyphs reuse Pixelify's exact edge coordinates (read from the font files),
 * so stroke weight, notched corners and spacing are identical to its other digits:
 *   2 -> Pixelify's top and middle, but a flat, square bottom bar
 *   5 -> a flat, square top bar (no hook), Pixelify's middle and bottom
 * Each glyph is traced into one clean outline (no overlapping pieces), like the
 * original, so it rasterises with the same solid shading.
 *
 *   npx vite-node scripts/build-digit-font.ts
 */
import { writeFileSync } from 'node:fs';
import opentype from 'opentype.js';

// Pixelify Sans edge coordinates (font units, 1000/em), read from its 2/3/S outlines.
//   X: outer-left, left-notch, left-stem-inner, right-stem-inner, right-notch, outer-right
//   Y: bottom, bottom-notch, bottom-bar-top, low-hook-top, mid-bar-bottom, mid-notch-low,
//      mid-notch-high, mid-bar-top, top-hook-bottom, top-bar-bottom, top-notch, top
const PIXELIFY = {
  400: { advance: 586, X: [60, 151, 161, 423, 433, 525], Y: [-12, 78, 88, 179, 260, 270, 350, 359, 440, 530, 540, 631] },
  700: { advance: 603, X: [61, 149, 188, 414, 453, 542], Y: [-11, 74, 125, 211, 246, 297, 331, 381, 416, 501, 552, 638] },
} as const;

/** Rectangles as [x-from, x-to, y-from, y-to] indices into X / Y. */
type R = [number, number, number, number];
const GLYPHS: Record<string, R[]> = {
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

/** Union the rectangles on the coordinate grid and trace the outline as closed loops. */
function trace(X: readonly number[], Y: readonly number[], rects: R[]): [number, number][][] {
  const W = X.length - 1;
  const H = Y.length - 1;
  const fill = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < W && j < H && rects.some(([x0, x1, y0, y1]) => i >= x0 && i < x1 && j >= y0 && j < y1);
  // directed boundary edges with the filled cell on the left (counter-clockwise outer loops)
  const edges = new Map<string, [number, number]>();
  for (let i = 0; i < W; i++)
    for (let j = 0; j < H; j++) {
      if (!fill(i, j)) continue;
      if (!fill(i, j - 1)) edges.set(`${i},${j}`, [i + 1, j]); // bottom edge, left->right
      if (!fill(i + 1, j)) edges.set(`${i + 1},${j}`, [i + 1, j + 1]); // right edge, up
      if (!fill(i, j + 1)) edges.set(`${i + 1},${j + 1}`, [i, j + 1]); // top edge, right->left
      if (!fill(i - 1, j)) edges.set(`${i},${j + 1}`, [i, j]); // left edge, down
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
    // drop collinear points
    const pts = loop.filter((p, k) => {
      const prev = loop[(k - 1 + loop.length) % loop.length];
      const next = loop[(k + 1) % loop.length];
      return !((prev[0] === p[0] && p[0] === next[0]) || (prev[1] === p[1] && p[1] === next[1]));
    });
    loops.push(pts);
  }
  return loops;
}

function build(weight: 400 | 700) {
  const { advance, X, Y } = PIXELIFY[weight];
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: advance, path: new opentype.Path() })];
  for (const [ch, rects] of Object.entries(GLYPHS)) {
    const path = new opentype.Path();
    for (const loop of trace(X, Y, rects)) {
      loop.forEach(([x, y], k) => (k === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
      path.close();
    }
    glyphs.push(new opentype.Glyph({ name: `digit${ch}`, unicode: ch.charCodeAt(0), advanceWidth: advance, path }));
  }
  const font = new opentype.Font({
    familyName: 'Tichu Digits',
    styleName: weight === 700 ? 'Bold' : 'Regular',
    unitsPerEm: 1000,
    ascender: 640,
    descender: -20,
    glyphs,
  });
  const out = `src/ui/fonts/tichu-digits-${weight}.otf`;
  writeFileSync(out, Buffer.from(font.toArrayBuffer()));
  console.log('wrote', out);
}

build(400);
build(700);
