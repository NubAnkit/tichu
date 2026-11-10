import type { CSSProperties, MouseEvent } from 'react';
import { CARDS, CardId, rankLabel } from '../../engine/cards';
import { SpecialGlyph, SuitGlyph } from './Glyphs';
import { PIXELIFY, digitSvgPath } from '../fonts/digitGlyphs';

const SPECIAL_LABEL: Record<string, string> = { mahjong: '1', dog: 'DOG', phoenix: 'PHX', dragon: 'DRG' };
const SPECIAL_TITLE: Record<string, string> = { mahjong: 'Mah Jong', dog: 'Dog', phoenix: 'Phoenix', dragon: 'Dragon' };

/*
 * A card rank label. In the Arcade theme, 2 and 5 are drawn as inline SVG
 * (see fonts/digitGlyphs.ts) because Pixelify Sans draws them like an S. Inline
 * shapes render the same in every browser, unlike a downloaded font.
 */
const PIX_2 = digitSvgPath('2', 700);
const PIX_5 = digitSvgPath('5', 700);
const { advance: PIX_ADV, Y: PIX_Y } = PIXELIFY[700];
const PIX_H = PIX_Y[11] - PIX_Y[0];

function PixelDigit({ ch }: { ch: '2' | '5' }) {
  return (
    <svg className="rank-pixel" viewBox={`0 0 ${PIX_ADV} ${PIX_H}`} fill="currentColor" aria-hidden>
      <path d={ch === '2' ? PIX_2 : PIX_5} />
    </svg>
  );
}

export function RankText({ label }: { label: string }) {
  if (!/[25]/.test(label)) return <span className="card-rank">{label}</span>;
  return (
    <span className="card-rank" aria-label={label}>
      {[...label].map((ch, i) =>
        ch === '2' || ch === '5' ? (
          <span key={i} className="pix-char">
            <span className="rank-font">{ch}</span>
            <PixelDigit ch={ch} />
          </span>
        ) : (
          ch
        ),
      )}
    </span>
  );
}

interface Props {
  id?: CardId;
  faceDown?: boolean;
  selected?: boolean;
  hinted?: boolean;
  tag?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

function tilt(e: MouseEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.setProperty('--rx', `${(-y * 18).toFixed(1)}deg`);
  el.style.setProperty('--ry', `${(x * 18).toFixed(1)}deg`);
  el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`);
  el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(0)}%`);
}
function untilt(e: MouseEvent<HTMLDivElement>) {
  e.currentTarget.style.setProperty('--rx', '0deg');
  e.currentTarget.style.setProperty('--ry', '0deg');
}

export function Card({ id, faceDown, selected, hinted, tag, size = 'md', className = '', style, onClick }: Props) {
  if (faceDown || id === undefined) {
    return (
      <div className={`card card-back size-${size} ${className}`} style={style}>
        <div className="card-back-art">
          <div className="card-back-emblem" />
        </div>
      </div>
    );
  }
  const c = CARDS[id];
  const kind = c.special ?? c.suit!;
  const label = c.special ? SPECIAL_LABEL[c.special] : rankLabel(c.rank);
  const classes = [
    'card',
    `size-${size}`,
    `kind-${kind}`,
    c.special ? 'special' : 'normal',
    selected && 'selected',
    hinted && 'hinted',
    onClick && 'clickable',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={classes}
      style={style}
      onClick={onClick}
      onMouseMove={onClick ? tilt : undefined}
      onMouseLeave={onClick ? untilt : undefined}
      title={c.special ? SPECIAL_TITLE[c.special] : undefined}
      data-card={id}
    >
      <div className="card-face">
        <div className="card-corner tl">
          {c.special && c.special !== 'mahjong' ? (
            <SpecialGlyph special={c.special} size={size === 'sm' ? 12 : size === 'md' ? 15 : 18} />
          ) : (
            <RankText label={label} />
          )}
          {c.suit && <SuitGlyph suit={c.suit} size={size === 'sm' ? 10 : 13} />}
        </div>
        <div className="card-center">
          {c.special ? (
            <SpecialGlyph special={c.special} size={size === 'sm' ? 28 : size === 'md' ? 42 : 56} />
          ) : (
            <SuitGlyph suit={c.suit!} size={size === 'sm' ? 16 : size === 'md' ? 26 : 34} />
          )}
        </div>
        {size !== 'sm' && !c.special && (
          <div className="card-corner br">
            <RankText label={label} />
          </div>
        )}
        {c.special && size !== 'sm' && <div className="card-title">{SPECIAL_TITLE[c.special]}</div>}
        <div className="card-sheen" />
      </div>
      {tag && <div className="card-tag">{tag}</div>}
    </div>
  );
}
