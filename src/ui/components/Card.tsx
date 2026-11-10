import type { CSSProperties, MouseEvent } from 'react';
import { CARDS, CardId, rankLabel } from '../../engine/cards';
import { SpecialGlyph, SuitGlyph } from './Glyphs';

const SPECIAL_LABEL: Record<string, string> = { mahjong: '1', dog: 'DOG', phoenix: 'PHX', dragon: 'DRG' };
const SPECIAL_TITLE: Record<string, string> = { mahjong: 'Mah Jong', dog: 'Dog', phoenix: 'Phoenix', dragon: 'Dragon' };

/** A card rank label. (The Arcade theme's clearer 2 and 5 come from its "Tichu Digits" font.) */
export function RankText({ label }: { label: string }) {
  return <span className="card-rank">{label}</span>;
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
