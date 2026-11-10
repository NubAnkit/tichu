import { ALL_CARDS, CARDS, CardId, DRAGON, MAHJONG, PHOENIX, sortCards } from '../engine/cards';
import { Combo, comboKey, isBomb, parseCombo } from '../engine/combos';

/** Rough probability (0..1+) that a combo wins a trick / takes control. Static, no card counting. */
export function comboStrength(c: Combo): number {
  const r = c.rank;
  switch (c.type) {
    case 'bomb4':
    case 'bombsf':
      return 1.25;
    case 'dog':
      return 0.35;
    case 'single':
      if (c.cards[0] === DRAGON) return 1;
      if (c.cards[0] === PHOENIX) return 0.85;
      if (c.cards[0] === MAHJONG) return 0;
      if (r >= 14) return 0.72;
      if (r >= 13) return 0.5;
      if (r >= 12) return 0.32;
      return r / 40;
    case 'pair':
      if (r >= 14) return 0.8;
      if (r >= 13) return 0.65;
      if (r >= 11) return 0.45;
      return r / 35;
    case 'triple':
      return Math.min(0.9, 0.25 + r / 22);
    case 'fullhouse':
      return Math.min(0.9, 0.35 + r / 30);
    case 'straight':
      return Math.min(0.95, 0.4 + (r - 5) / 22 + (c.length - 5) * 0.08);
    case 'pairseq':
      return Math.min(0.95, 0.3 + r / 35 + (c.length - 4) * 0.08);
  }
}

export const comboCost = (c: Combo) => 1 - comboStrength(c);

export interface Plan {
  combos: Combo[];
  cost: number;
}

const planCache = new Map<string, Plan>();

function minus(cards: readonly CardId[], remove: readonly CardId[]): CardId[] {
  const set = new Set(remove);
  return cards.filter((c) => !set.has(c));
}

function mk(cards: CardId[]): Combo {
  const c = parseCombo(cards);
  if (!c) throw new Error(`plan produced invalid combo ${cards.join(',')}`);
  return c;
}

const costOf = (combos: Combo[]) => combos.reduce((a, c) => a + comboCost(c), 0);

/** Group-only decomposition: bombs(4), triples, pairs, stairs, full houses, singles. */
function groupPlan(cards: CardId[], phoenixMode: 'single' | 'join'): Combo[] {
  const byRank = new Map<number, CardId[]>();
  const loners: CardId[] = [];
  let phoenix = false;
  for (const id of cards) {
    if (id === PHOENIX) phoenix = true;
    else if (CARDS[id].suit) {
      const r = CARDS[id].rank;
      byRank.set(r, [...(byRank.get(r) ?? []), id]);
    } else loners.push(id); // Dog, Mah Jong, Dragon
  }
  if (phoenix && phoenixMode === 'join') {
    // attach Phoenix to the highest lonely card below A (pair) or a pair (triple)
    const singles = [...byRank.entries()].filter(([, v]) => v.length === 1).sort((a, b) => b[0] - a[0]);
    const target = singles.find(([r]) => r < 14) ?? singles[0];
    if (target) {
      target[1].push(PHOENIX);
      phoenix = false;
    }
  }
  const combos: CardId[][] = [];
  const pairs: { r: number; cards: CardId[] }[] = [];
  const triples: { r: number; cards: CardId[] }[] = [];
  for (const [r, ids] of byRank) {
    if (ids.length === 4 && !ids.includes(PHOENIX)) combos.push(ids);
    else if (ids.length === 4) {
      triples.push({ r, cards: ids.slice(0, 3) });
      combos.push([ids[3]]);
    } else if (ids.length === 3) triples.push({ r, cards: ids });
    else if (ids.length === 2) pairs.push({ r, cards: ids });
    else combos.push(ids);
  }
  // stairs from consecutive pairs
  pairs.sort((a, b) => a.r - b.r);
  const restPairs: typeof pairs = [];
  for (let i = 0; i < pairs.length; ) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].r === pairs[j].r + 1) j++;
    if (j > i) combos.push(pairs.slice(i, j + 1).flatMap((p) => p.cards));
    else restPairs.push(pairs[i]);
    i = j + 1;
  }
  // full houses: lowest triple + lowest leftover pair
  triples.sort((a, b) => a.r - b.r);
  restPairs.sort((a, b) => a.r - b.r);
  while (triples.length && restPairs.length && restPairs[0].r < 12) {
    const t = triples.shift()!;
    const p = restPairs.shift()!;
    if (t.cards.includes(PHOENIX) && p.cards.includes(PHOENIX)) {
      combos.push(t.cards, p.cards);
    } else combos.push([...t.cards, ...p.cards]);
  }
  for (const t of triples) combos.push(t.cards);
  for (const p of restPairs) combos.push(p.cards);
  for (const l of loners) combos.push([l]);
  if (phoenix) combos.push([PHOENIX]);
  return combos.map(mk);
}

/** Straight windows (one card per rank, Phoenix may fill a single gap). */
function straightOptions(cards: CardId[]): CardId[][] {
  const byRank: CardId[][] = Array.from({ length: 15 }, () => []);
  let phoenix = false;
  for (const id of cards) {
    if (id === PHOENIX) phoenix = true;
    else if (id === MAHJONG) byRank[1].push(id);
    else if (CARDS[id].suit) byRank[CARDS[id].rank].push(id);
  }
  const out: CardId[][] = [];
  for (let start = 1; start <= 10; start++) {
    for (let len = 5; start + len - 1 <= 14; len++) {
      const ranks = Array.from({ length: len }, (_, i) => start + i);
      const missing = ranks.filter((r) => byRank[r].length === 0);
      if (missing.length > 1) break;
      if (missing.length === 1 && (!phoenix || missing[0] === 1)) {
        if (missing[0] === start + len - 1) break; // can't extend further either
        continue;
      }
      // prefer the card that is alone at its rank (keeps pairs intact)
      out.push(ranks.map((r) => (byRank[r].length ? byRank[r][byRank[r].length - 1] : PHOENIX)));
    }
  }
  return out;
}

function bestPlan(cards: CardId[], depth: number): Combo[] {
  let best = groupPlan(cards, 'single');
  let bestCost = costOf(best);
  if (cards.includes(PHOENIX)) {
    const alt = groupPlan(cards, 'join');
    const c = costOf(alt);
    if (c < bestCost) [best, bestCost] = [alt, c];
  }
  if (depth < 3 && cards.length >= 5) {
    for (const s of straightOptions(cards)) {
      const rest = bestPlan(minus(cards, s), depth + 1);
      const combos = [mk(s), ...rest];
      const c = costOf(combos);
      if (c < bestCost - 1e-9) [best, bestCost] = [combos, c];
    }
  }
  return best;
}

/** Find straight-flush bombs (greedy, longest first). */
function extractFlushBombs(cards: CardId[]): { bombs: CardId[][]; rest: CardId[] } {
  const bombs: CardId[][] = [];
  let rest = [...cards];
  for (let suit = 0; suit < 4; suit++) {
    const ranks = new Set(rest.filter((id) => id < 52 && Math.floor(id / 13) === suit).map((id) => (id % 13) + 2));
    let r = 2;
    while (r <= 14) {
      if (!ranks.has(r)) {
        r++;
        continue;
      }
      let e = r;
      while (ranks.has(e + 1)) e++;
      if (e - r + 1 >= 5) {
        const ids = [];
        for (let k = r; k <= e; k++) ids.push(suit * 13 + k - 2);
        bombs.push(ids);
        rest = minus(rest, ids);
      }
      r = e + 1;
    }
  }
  return { bombs, rest };
}

/** Decompose a hand into a sensible set of combos to play out. */
export function planHand(hand: readonly CardId[]): Plan {
  const key = comboKey(hand);
  const cached = planCache.get(key);
  if (cached) return cached;
  const { bombs, rest } = extractFlushBombs(sortCards(hand));
  const combos = [...bombs.map(mk), ...bestPlan(rest, 0)];
  const plan = { combos, cost: costOf(combos) };
  if (planCache.size > 20000) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

export const planCost = (hand: readonly CardId[]) => (hand.length ? planHand(hand).cost : -1.5);

// ---------------------------------------------------------------------------
// Card counting
// ---------------------------------------------------------------------------

/** Cards not in my hand and not yet played. */
export function unseenCards(hand: readonly CardId[], played: readonly CardId[]): CardId[] {
  const known = new Set([...hand, ...played]);
  return ALL_CARDS.filter((c) => !known.has(c));
}

/**
 * Probability-ish estimate that `c` won't be beaten by any card still out,
 * using card counting. Ignores bombs except as a small discount.
 */
export function countingWinProb(c: Combo, unseen: readonly CardId[], opponentsCards: number): number {
  if (isBomb(c)) return 0.95;
  if (c.type === 'dog') return 0;
  const counts = new Array(16).fill(0);
  let phoenix = false;
  let dragon = false;
  for (const id of unseen) {
    if (id === PHOENIX) phoenix = true;
    else if (id === DRAGON) dragon = true;
    else if (CARDS[id].suit) counts[CARDS[id].rank]++;
  }
  const scale = opponentsCards > 0 ? Math.min(1, opponentsCards / Math.max(1, unseen.length)) : 0;
  let threats = 0;
  switch (c.type) {
    case 'single': {
      if (c.cards[0] === DRAGON) return 0.97;
      for (let r = Math.floor(c.rank) + 1; r <= 14; r++) threats += counts[r];
      if (dragon) threats += 1.5;
      if (phoenix) threats += 1;
      break;
    }
    case 'pair':
    case 'triple': {
      const need = c.type === 'pair' ? 2 : 3;
      for (let r = c.rank + 1; r <= 14; r++) {
        const n = counts[r] + (phoenix ? 1 : 0);
        if (n >= need) threats += n - need + 1;
      }
      break;
    }
    default:
      return comboStrength(c);
  }
  if (threats === 0) return 0.97;
  return Math.max(0.03, Math.pow(1 - 0.35 * scale - 0.1, threats));
}
