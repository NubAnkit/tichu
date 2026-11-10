/**
 * Registers the "Tichu Digits" font (clearer 2 and 5 over Pixelify Sans, see
 * digitGlyphs.ts). The font bytes are compiled into the JS bundle and handed to
 * the browser directly, so there is no font download that a proxy, cache or
 * blocker can break.
 */
import { DIGIT_FONT_400, DIGIT_FONT_700 } from './digitFontData';

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function registerDigitFont() {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  const opts = { unicodeRange: 'U+0032, U+0035' };
  const faces = [
    new FontFace('Tichu Digits', bytes(DIGIT_FONT_400), { ...opts, weight: '100 549' }),
    new FontFace('Tichu Digits', bytes(DIGIT_FONT_700), { ...opts, weight: '550 900' }),
  ];
  for (const f of faces) {
    document.fonts.add(f);
    f.load().catch((e) => console.warn('Tichu Digits font failed to load', e));
  }
}
