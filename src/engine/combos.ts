import { CARDS, CardId, DOG, DRAGON, MAHJONG, PHOENIX, sortCards } from './cards';

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'fullhouse'
  | 'straight'
  | 'pairseq'
  | 'bomb4'
  | 'bombsf'
  | 'dog';

export interface Combo {
  type: ComboType;
  /**
   * Comparison rank. Singles: card rank (Phoenix = previous + 0.5, Dragon = 15).
   * Groups: the rank of the group. Full house: rank of the triple.
   * Straights / pair sequences / straight flushes: the highest rank.
   */
  rank: number;
  /** Number of cards. */
  length: number;
  cards: CardId[];
  /** What rank the Phoenix stands for, if it is in the combo. */
  phoenixAs?: number;
}

export const isBomb = (c: Combo | null | undefined) =>
  !!c && (c.type === 'bomb4' || c.type === 'bombsf');

export const COMBO_NAMES: Record<ComboType, string> = {
  single: 'Single',
  pair: 'Pair',
  triple: 'Triple',
  fullhouse: 'Full House',
  straight: 'Straight',
  pairseq: 'Stairs',
  bomb4: 'Four-of-a-kind Bomb',
  bombsf: 'Straight-Flush Bomb',
  dog: 'Dog',
};

interface Shape {
  type: ComboType;
  rank: number;
}

/** Classify a multiset of plain ranks (Phoenix already substituted). */
function classify(ranks: number[], sameSuit: boolean, hasPhoenix: boolean, hasMahjong: boolean): Shape | null {
  const n = ranks.length;
  const r = [...ranks].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const x of r) counts.set(x, (counts.get(x) ?? 0) + 1);
  const distinct = [...counts.keys()].sort((a, b) => a - b);

  if (n === 2) return r[0] === r[1] ? { type: 'pair', rank: r[0] } : null;
  if (n === 3) return r[0] === r[2] ? { type: 'triple', rank: r[0] } : null;
  if (n === 4 && r[0] === r[3]) return hasPhoenix ? null : { type: 'bomb4', rank: r[0] };
  if (n === 5 && distinct.length === 2) {
    const [a, b] = distinct;
    if (counts.get(a) === 3 && counts.get(b) === 2) return { type: 'fullhouse', rank: a };
    if (counts.get(b) === 3 && counts.get(a) === 2) return { type: 'fullhouse', rank: b };
  }
  const consecutive = distinct.every((x, i) => i === 0 || x === distinct[i - 1] + 1);
  if (n >= 4 && n % 2 === 0 && consecutive && distinct.length === n / 2 && distinct.every((x) => counts.get(x) === 2)) {
    return { type: 'pairseq', rank: distinct[distinct.length - 1] };
  }
  if (n >= 5 && consecutive && distinct.length === n) {
    const top = distinct[distinct.length - 1];
    if (sameSuit && !hasPhoenix && !hasMahjong) return { type: 'bombsf', rank: top };
    return { type: 'straight', rank: top };
  }
  return null;
}

/**
 * Interpret a set of cards as a combination. When the Phoenix is involved the
 * highest-ranking interpretation is returned. `top` is the combo currently on
 * the table (only matters for a single Phoenix, whose value is top + 0.5).
 */
export function parseCombo(cardsIn: readonly CardId[], top: Combo | null = null): Combo | null {
  const cards = sortCards(cardsIn);
  const n = cards.length;
  if (n === 0) return null;
  if (new Set(cards).size !== n) return null;

  if (n === 1) {
    const id = cards[0];
    if (id === DOG) return { type: 'dog', rank: 0, length: 1, cards };
    if (id === PHOENIX) {
      const base = top && top.type === 'single' ? top.rank : 1;
      return { type: 'single', rank: base + 0.5, length: 1, cards, phoenixAs: base + 0.5 };
    }
    return { type: 'single', rank: CARDS[id].rank, length: 1, cards };
  }
  if (cards.includes(DOG) || cards.includes(DRAGON)) return null;

  const hasPhoenix = cards.includes(PHOENIX);
  const hasMahjong = cards.includes(MAHJONG);
  const others = cards.filter((id) => id !== PHOENIX);
  const ranks = others.map((id) => CARDS[id].rank);
  const suits = new Set(others.map((id) => CARDS[id].suit));
  const sameSuit = suits.size === 1 && !suits.has(null);

  if (!hasPhoenix) {
    const s = classify(ranks, sameSuit, false, hasMahjong);
    return s ? { ...s, length: n, cards } : null;
  }
  let best: Combo | null = null;
  for (let v = 2; v <= 14; v++) {
    const s = classify([...ranks, v], sameSuit, true, hasMahjong);
    if (s && (!best || s.rank > best.rank)) best = { ...s, length: n, cards, phoenixAs: v };
  }
  return best;
}

/** Does `a` beat `b`? (`b` null = leading, anything goes.) */
export function beats(a: Combo, b: Combo | null): boolean {
  if (!b) return true;
  if (a.type === 'dog' || b.type === 'dog') return false;
  if (isBomb(a)) {
    if (!isBomb(b)) return true;
    if (a.type !== b.type) return a.type === 'bombsf';
    if (a.type === 'bombsf' && a.length !== b.length) return a.length > b.length;
    return a.rank > b.rank;
  }
  if (isBomb(b)) return false;
  if (a.type !== b.type || a.length !== b.length) return false;
  if (a.type === 'single') {
    if (b.cards[0] === DRAGON) return false;
    if (a.cards[0] === PHOENIX) return true; // Phoenix beats any non-Dragon single
  }
  return a.rank > b.rank;
}

export const comboKey = (cards: readonly CardId[]) => sortCards(cards).join(',');

/** Human-readable description, e.g. "Pair of 7s", "Straight to K (6 cards)". */
export function describeCombo(c: Combo): string {
  const label = (r: number) => {
    const n = Math.floor(r);
    return n === 11 ? 'J' : n === 12 ? 'Q' : n === 13 ? 'K' : n === 14 ? 'A' : String(n);
  };
  switch (c.type) {
    case 'single': {
      const id = c.cards[0];
      if (id === PHOENIX) return 'Phoenix';
      if (id === DRAGON) return 'Dragon';
      if (id === MAHJONG) return 'Mah Jong';
      return `Single ${label(c.rank)}`;
    }
    case 'pair':
      return `Pair of ${label(c.rank)}s`;
    case 'triple':
      return `Triple ${label(c.rank)}s`;
    case 'fullhouse':
      return `Full House (${label(c.rank)}s)`;
    case 'straight':
      return c.length === 5 ? `Straight to ${label(c.rank)}` : `${c.length}-card Straight to ${label(c.rank)}`;
    case 'pairseq':
      return `Stairs to ${label(c.rank)}s (${c.length / 2} pairs)`;
    case 'bomb4':
      return `BOMB: four ${label(c.rank)}s`;
    case 'bombsf':
      return `BOMB: straight flush to ${label(c.rank)}`;
    case 'dog':
      return 'Dog';
  }
}

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------

function combinations<T>(arr: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const cur: T[] = [];
  const rec = (start: number) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}

function product<T>(lists: T[][][]): T[][] {
  let acc: T[][] = [[]];
  for (const options of lists) {
    const next: T[][] = [];
    for (const a of acc) for (const o of options) next.push([...a, ...o]);
    acc = next;
  }
  return acc;
}

/**
 * Every set of cards from `hand` that forms a valid combination
 * (each set once, regardless of Phoenix interpretation).
 */
export function generateCandidates(hand: readonly CardId[]): CardId[][] {
  const out = new Map<string, CardId[]>();
  const add = (cards: CardId[]) => {
    const k = comboKey(cards);
    if (!out.has(k)) out.set(k, cards);
  };
  const hasPhoenix = hand.includes(PHOENIX);
  const byRank: CardId[][] = Array.from({ length: 15 }, () => []);
  for (const id of hand) {
    const c = CARDS[id];
    if (c.suit) byRank[c.rank].push(id);
    else if (id === MAHJONG) byRank[1].push(id);
  }

  // Singles
  for (const id of hand) add([id]);

  // Groups of 2 / 3 / 4 for each rank (with optional Phoenix)
  const groups: CardId[][][] = [[], [], [], [], []]; // groups[size] = list
  const groupsByRank: { pair: CardId[][]; triple: CardId[][] }[] = Array.from({ length: 15 }, () => ({
    pair: [],
    triple: [],
  }));
  for (let r = 2; r <= 14; r++) {
    const cs = byRank[r];
    for (const k of [2, 3]) {
      const sets = combinations(cs, k);
      if (hasPhoenix && cs.length >= k - 1) for (const s of combinations(cs, k - 1)) sets.push([...s, PHOENIX]);
      for (const s of sets) {
        groups[k].push(s);
        (k === 2 ? groupsByRank[r].pair : groupsByRank[r].triple).push(s);
      }
    }
    if (cs.length === 4) groups[4].push([...cs]);
  }
  for (const g of [...groups[2], ...groups[3], ...groups[4]]) add(g);

  // Full houses
  for (let a = 2; a <= 14; a++) {
    for (const t of groupsByRank[a].triple) {
      for (let b = 2; b <= 14; b++) {
        if (a === b) continue;
        for (const p of groupsByRank[b].pair) {
          if (t.includes(PHOENIX) && p.includes(PHOENIX)) continue;
          add([...t, ...p]);
        }
      }
    }
  }

  // Straights (length >= 5), Phoenix may fill or replace one rank (not the 1)
  for (let len = 5; len <= 14; len++) {
    for (let start = 1; start + len - 1 <= 14; start++) {
      const ranks = Array.from({ length: len }, (_, i) => start + i);
      const missing = ranks.filter((r) => byRank[r].length === 0);
      if (missing.length > 1 || (missing.length === 1 && (!hasPhoenix || missing[0] === 1))) continue;
      const lists = ranks.map((r) => byRank[r].map((id) => [id]));
      if (missing.length === 1) {
        lists[ranks.indexOf(missing[0])] = [[PHOENIX]];
        for (const s of product(lists)) add(s);
      } else {
        for (const s of product(lists)) add(s);
        if (hasPhoenix) {
          for (let i = 0; i < len; i++) {
            if (ranks[i] === 1) continue;
            const l2 = [...lists];
            l2[i] = [[PHOENIX]];
            for (const s of product(l2)) add(s);
          }
        }
      }
    }
  }

  // Pair sequences (>= 2 consecutive pairs); Phoenix may complete one pair
  for (let len = 2; len <= 7; len++) {
    for (let start = 2; start + len - 1 <= 14; start++) {
      const ranks = Array.from({ length: len }, (_, i) => start + i);
      if (ranks.some((r) => byRank[r].length + (hasPhoenix ? 1 : 0) < 2)) continue;
      const plain = ranks.map((r) => combinations(byRank[r], 2));
      if (plain.every((l) => l.length > 0)) for (const s of product(plain)) add(s);
      if (hasPhoenix) {
        for (let i = 0; i < len; i++) {
          if (byRank[ranks[i]].length < 1) continue;
          const lists = [...plain];
          lists[i] = byRank[ranks[i]].map((id) => [id, PHOENIX]);
          if (lists.every((l) => l.length > 0)) for (const s of product(lists)) add(s);
        }
      }
    }
  }

  return [...out.values()];
}

/** Does this combo contain a real (non-Phoenix) card of the given rank? */
export const containsRank = (cards: readonly CardId[], rank: number) =>
  cards.some((id) => CARDS[id].suit !== null && CARDS[id].rank === rank);

export interface LegalPlays {
  plays: Combo[];
  /** True if a Mah Jong wish is active and the player must fulfil it. */
  mustFulfill: boolean;
}

/** All plays available from `hand` against `top` (null = leading), honouring the wish. */
export function legalPlays(hand: readonly CardId[], top: Combo | null, wish: number | null): LegalPlays {
  const plays: Combo[] = [];
  for (const cards of generateCandidates(hand)) {
    const c = parseCombo(cards, top);
    if (!c) continue;
    if (top && !beats(c, top)) continue;
    plays.push(c);
  }
  if (wish !== null && containsRank(hand, wish)) {
    const fulfilling = plays.filter((c) => containsRank(c.cards, wish));
    if (fulfilling.length) return { plays: fulfilling, mustFulfill: true };
  }
  return { plays, mustFulfill: false };
}
