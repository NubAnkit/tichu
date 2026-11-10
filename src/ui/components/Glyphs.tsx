import type { Special, Suit } from '../../engine/cards';

/** Original suit / special-card glyphs. All drawn on a 32x32 grid using currentColor. */

export function SuitGlyph({ suit, size = 24 }: { suit: Suit; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className="glyph" aria-hidden>
      {suit === 'jade' && (
        // jade coin: disc with square hole
        <path fillRule="evenodd" d="M16 3a13 13 0 1 1 0 26a13 13 0 1 1 0-26zM12 12h8v8h-8z" fill="currentColor" />
      )}
      {suit === 'sword' && (
        <g fill="currentColor">
          <path d="M16 2 L19 7 L19 20 L13 20 L13 7 Z" />
          <rect x="8" y="20" width="16" height="3" rx="1.2" />
          <rect x="14.5" y="23" width="3" height="5" />
          <circle cx="16" cy="29" r="2.2" />
        </g>
      )}
      {suit === 'pagoda' && (
        <g fill="currentColor">
          <path d="M16 1 L17.2 5 L14.8 5 Z" />
          <path d="M9 9 Q16 4 23 9 L21 10 L11 10 Z" />
          <rect x="12.5" y="10" width="7" height="4" />
          <path d="M6 17 Q16 11 26 17 L23.5 18 L8.5 18 Z" />
          <rect x="11" y="18" width="10" height="4" />
          <path d="M3 25 Q16 18 29 25 L26 26 L6 26 Z" />
          <rect x="9" y="26" width="14" height="5" />
        </g>
      )}
      {suit === 'star' && (
        <path
          fill="currentColor"
          d="M16 2 L19.6 11.6 L29.5 11.9 L21.7 18.1 L24.4 28 L16 22.3 L7.6 28 L10.3 18.1 L2.5 11.9 L12.4 11.6 Z"
        />
      )}
    </svg>
  );
}

const MIRROR = 'matrix(-1 0 0 1 64 0)';
const FACE = 'var(--card-face, #fff)';
const DARK = 'var(--glyph-dark, #1a0d08)';

/** Original artwork for the special cards (64x64 grid; Mah Jong keeps its 32 grid). */
export function SpecialGlyph({ special, size = 48 }: { special: Special; size?: number }) {
  if (special === 'mahjong') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} className="glyph glyph-mahjong" aria-hidden>
        {/* a little sparrow */}
        <g fill="currentColor">
          <path d="M5 19 C7 11 14 8 19 11 L27 8 L22 13 C23 19 17 24 10 23 L6 26 L7 22 Z" />
          <circle cx="20.5" cy="12" r="1.1" fill={FACE} />
          <path d="M11 16 C14 15 16 17 17 19" stroke={FACE} strokeWidth="1.2" fill="none" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`glyph glyph-${special}`} aria-hidden>
      {special === 'dog' && <DogArt />}
      {special === 'phoenix' && <PhoenixArt />}
      {special === 'dragon' && <DragonArt />}
    </svg>
  );
}

/** Front-facing hound: floppy ears, light muzzle, tongue out. */
function DogArt() {
  return (
    <g>
      {/* ears (behind the head) */}
      <g fill={DARK} opacity="0.9">
        <path d="M20 14 C12 14 6 22 7 34 C8 42 12 46 16 44 C19 42 19 34 21 26 Z" />
        <path d="M20 14 C12 14 6 22 7 34 C8 42 12 46 16 44 C19 42 19 34 21 26 Z" transform={MIRROR} />
      </g>
      {/* head */}
      <path fill="currentColor" d="M32 10 C42 10 48 17 48 28 C48 35 46 40 44 44 C41 51 37 55 32 55 C27 55 23 51 20 44 C18 40 16 35 16 28 C16 17 22 10 32 10 Z" />
      {/* blaze + muzzle */}
      <path fill={FACE} opacity="0.92" d="M32 18 C34 24 35 30 37 34 C42 36 43 43 40 48 C38 52 35 54 32 54 C29 54 26 52 24 48 C21 43 22 36 27 34 C29 30 30 24 32 18 Z" />
      {/* eyes */}
      <g fill={DARK}>
        <ellipse cx="24.5" cy="29" rx="3" ry="3.4" />
        <ellipse cx="39.5" cy="29" rx="3" ry="3.4" />
      </g>
      <circle cx="25.6" cy="27.8" r="1" fill="#fff" />
      <circle cx="40.6" cy="27.8" r="1" fill="#fff" />
      {/* brows */}
      <path d="M20.5 23.5 C23 21.5 26 21.5 28 23" stroke={DARK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M43.5 23.5 C41 21.5 38 21.5 36 23" stroke={DARK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* nose */}
      <path fill={DARK} d="M27.5 38.5 C27.5 36 36.5 36 36.5 38.5 C36.5 41 34 43 32 43 C30 43 27.5 41 27.5 38.5 Z" />
      <ellipse cx="30.4" cy="38.2" rx="1.3" ry="0.8" fill="#fff" opacity="0.6" />
      {/* mouth + tongue */}
      <path d="M32 43 L32 46 M32 46 C30 48.5 27 48.5 25.5 46.5 M32 46 C34 48.5 37 48.5 38.5 46.5" stroke={DARK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path fill="#e8566b" d="M29.5 47.5 C29.5 52 34.5 52 34.5 47.5 C33.5 48.3 30.5 48.3 29.5 47.5 Z" />
    </g>
  );
}

/** Rising firebird: crest, scalloped wings, flame tail. */
function PhoenixArt() {
  const wing = 'M29 33 C23 27 15 19 4 7 C9 17 11 20 14 23 C9 22 6 21 2 19 C7 26 12 29 17 31 C12 32 8 32 4 32 C11 38 20 40 28 39 Z';
  const inner = 'M29 34 C24 30 19 26 13 20 C16 26 18 28 20 30 C17 30 14 30 11 29 C16 34 22 36 28 37 Z';
  return (
    <g>
      {/* flame tail */}
      <path fill="currentColor" d="M32 44 C25 49 22 55 25 63 C27 59 29 57 31 56 C30 59 31 61 32 63 C33 61 34 59 33 56 C35 57 37 59 39 63 C42 55 39 49 32 44 Z" />
      <path fill="var(--phoenix-core, #ffd36b)" d="M32 48 C29 52 29 56 31 60 C31.5 57 32.5 57 33 60 C35 56 35 52 32 48 Z" />
      {/* wings */}
      <path fill="currentColor" d={wing} />
      <path fill="currentColor" d={wing} transform={MIRROR} />
      <path fill="var(--phoenix-core, #ffd36b)" opacity="0.85" d={inner} />
      <path fill="var(--phoenix-core, #ffd36b)" opacity="0.85" d={inner} transform={MIRROR} />
      {/* body */}
      <path fill="currentColor" d="M32 18 C37 22 38 31 36 39 C35 43 34 46 32 49 C30 46 29 43 28 39 C26 31 27 22 32 18 Z" />
      <path fill="var(--phoenix-core, #ffd36b)" d="M32 26 C34 30 34.5 35 33.5 40 C33 42 32.5 43.5 32 45 C31.5 43.5 31 42 30.5 40 C29.5 35 30 30 32 26 Z" />
      {/* head + crest */}
      <path fill="currentColor" d="M29 14 C27 9 29 5 31 2 C31 6 33 7 33 3 C36 6 36 10 34.5 14 Z" />
      <circle cx="32" cy="17" r="4.6" fill="currentColor" />
      <path fill="var(--phoenix-core, #ffd36b)" d="M30.6 19.5 L32 23.5 L33.4 19.5 Z" />
      <circle cx="30.3" cy="16.3" r="0.9" fill={DARK} />
      <circle cx="33.7" cy="16.3" r="0.9" fill={DARK} />
    </g>
  );
}

/** Horned dragon mask: spiny fins, gold slit eyes, flowing whiskers. */
function DragonArt() {
  return (
    <g>
      {/* whiskers */}
      <g stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M25 47 C17 47 11 51 9 60" />
        <path d="M39 47 C47 47 53 51 55 60" />
      </g>
      {/* horns */}
      <g fill={DARK}>
        <path d="M24 17 C20 11 17 7 11 3 C14 9 17 13 19 20 Z" />
        <path d="M24 17 C20 11 17 7 11 3 C14 9 17 13 19 20 Z" transform={MIRROR} />
      </g>
      {/* side fins */}
      <g fill="currentColor" opacity="0.85">
        <path d="M18 24 L5 19 L11 27 L2 30 L12 33 L5 39 L18 37 Z" />
        <path d="M18 24 L5 19 L11 27 L2 30 L12 33 L5 39 L18 37 Z" transform={MIRROR} />
      </g>
      {/* head */}
      <path fill="currentColor" d="M32 13 C40 13 46 17 47 24 L48 34 C47 39 44 42 42 46 C40 52 37 55 32 55 C27 55 24 52 22 46 C20 42 17 39 16 34 L17 24 C18 17 24 13 32 13 Z" />
      {/* forehead scale + ridge */}
      <path fill={DARK} opacity="0.35" d="M32 15 L35 21 L32 27 L29 21 Z" />
      <path d="M22 25 C26 22 29 23 30 26 M42 25 C38 22 35 23 34 26" stroke={DARK} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* eyes */}
      <path fill="var(--dragon-iris, #ffcc33)" d="M20.5 29.5 C23 26.5 28 27 29.5 30.5 C26.5 33 22.5 32.5 20.5 29.5 Z" />
      <path fill="var(--dragon-iris, #ffcc33)" d="M43.5 29.5 C41 26.5 36 27 34.5 30.5 C37.5 33 41.5 32.5 43.5 29.5 Z" />
      <ellipse cx="25.3" cy="29.9" rx="0.9" ry="2.2" fill={DARK} />
      <ellipse cx="38.7" cy="29.9" rx="0.9" ry="2.2" fill={DARK} />
      {/* snout */}
      <path fill={DARK} opacity="0.25" d="M25 40 C28 37 36 37 39 40 L40 47 C37 51 27 51 24 47 Z" />
      <ellipse cx="28.5" cy="43" rx="1.6" ry="1.1" fill={DARK} />
      <ellipse cx="35.5" cy="43" rx="1.6" ry="1.1" fill={DARK} />
      {/* fangs */}
      <path fill={FACE} d="M27 49 L28.5 53.5 L30 49.6 Z M37 49 L35.5 53.5 L34 49.6 Z" />
    </g>
  );
}
