/**
 * Cards are plain integers (0..55) so states are cheap to clone, hash and
 * feed into ML models later.
 *   0..51  normal cards: suit = floor(id / 13), rank = id % 13 + 2  (2..14, A = 14)
 *   52     Mah Jong (rank 1)
 *   53     Dog
 *   54     Phoenix
 *   55     Dragon
 */
export type CardId = number;

export const MAHJONG: CardId = 52;
export const DOG: CardId = 53;
export const PHOENIX: CardId = 54;
export const DRAGON: CardId = 55;

export const SUITS = ['jade', 'sword', 'pagoda', 'star'] as const;
export type Suit = (typeof SUITS)[number];
export type Special = 'mahjong' | 'dog' | 'phoenix' | 'dragon';

export interface CardInfo {
  id: CardId;
  /** 2..14 for normal cards, 1 for Mah Jong, 0 for Dog/Phoenix, 15 for Dragon. */
  rank: number;
  suit: Suit | null;
  special: Special | null;
  points: number;
}

function buildCards(): CardInfo[] {
  const cards: CardInfo[] = [];
  for (let id = 0; id < 52; id++) {
    const rank = (id % 13) + 2;
    const points = rank === 5 ? 5 : rank === 10 || rank === 13 ? 10 : 0;
    cards.push({ id, rank, suit: SUITS[Math.floor(id / 13)], special: null, points });
  }
  cards.push({ id: MAHJONG, rank: 1, suit: null, special: 'mahjong', points: 0 });
  cards.push({ id: DOG, rank: 0, suit: null, special: 'dog', points: 0 });
  cards.push({ id: PHOENIX, rank: 0, suit: null, special: 'phoenix', points: -25 });
  cards.push({ id: DRAGON, rank: 15, suit: null, special: 'dragon', points: 25 });
  return cards;
}

export const CARDS: readonly CardInfo[] = buildCards();
export const ALL_CARDS: readonly CardId[] = CARDS.map((c) => c.id);

export const isNormal = (id: CardId) => id < 52;

export function rankLabel(rank: number): string {
  switch (rank) {
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    case 14:
      return 'A';
    default:
      return String(rank);
  }
}

export function cardName(id: CardId): string {
  const c = CARDS[id];
  switch (c.special) {
    case 'mahjong':
      return 'Mah Jong';
    case 'dog':
      return 'Dog';
    case 'phoenix':
      return 'Phoenix';
    case 'dragon':
      return 'Dragon';
    default:
      return `${rankLabel(c.rank)} of ${c.suit}`;
  }
}

/** Sort key: Dog, Mah Jong, 2..A (by suit within rank), Phoenix, Dragon. */
export function sortKey(id: CardId): number {
  const c = CARDS[id];
  switch (c.special) {
    case 'dog':
      return 0;
    case 'mahjong':
      return 1;
    case 'phoenix':
      return 200;
    case 'dragon':
      return 300;
    default:
      return c.rank * 10 + SUITS.indexOf(c.suit!);
  }
}

export function sortCards(ids: readonly CardId[]): CardId[] {
  return [...ids].sort((a, b) => sortKey(a) - sortKey(b));
}

export function cardPoints(ids: readonly CardId[]): number {
  let p = 0;
  for (const id of ids) p += CARDS[id].points;
  return p;
}
