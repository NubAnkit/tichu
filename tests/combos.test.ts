import { describe, expect, it } from 'vitest';
import { DOG, DRAGON, MAHJONG, PHOENIX, CardId } from '../src/engine/cards';
import { beats, comboKey, generateCandidates, legalPlays, parseCombo } from '../src/engine/combos';

// helpers: c(rank, suit) -> id
const c = (rank: number, suit = 0): CardId => suit * 13 + (rank - 2);

describe('parseCombo', () => {
  it('singles, pairs, triples', () => {
    expect(parseCombo([c(7)])).toMatchObject({ type: 'single', rank: 7 });
    expect(parseCombo([c(7), c(7, 1)])).toMatchObject({ type: 'pair', rank: 7 });
    expect(parseCombo([c(7), c(8)])).toBeNull();
    expect(parseCombo([c(9), c(9, 1), c(9, 2)])).toMatchObject({ type: 'triple', rank: 9 });
  });

  it('phoenix fills pairs, triples and picks best full house', () => {
    expect(parseCombo([c(7), PHOENIX])).toMatchObject({ type: 'pair', rank: 7 });
    expect(parseCombo([c(13), c(13, 1), c(12), c(12, 1), PHOENIX])).toMatchObject({ type: 'fullhouse', rank: 13 });
    expect(parseCombo([c(7), c(7, 1), c(7, 2), PHOENIX])).toBeNull(); // no Phoenix bombs
  });

  it('phoenix single is half above the top', () => {
    expect(parseCombo([PHOENIX])).toMatchObject({ rank: 1.5 });
    const top = parseCombo([c(10)])!;
    expect(parseCombo([PHOENIX], top)).toMatchObject({ rank: 10.5 });
    expect(beats(parseCombo([PHOENIX], top)!, top)).toBe(true);
    expect(beats(parseCombo([PHOENIX], parseCombo([DRAGON]))!, parseCombo([DRAGON]))).toBe(false);
    expect(beats(parseCombo([c(11)])!, parseCombo([PHOENIX], top)!)).toBe(true);
    expect(beats(parseCombo([c(10, 2)])!, parseCombo([PHOENIX], top)!)).toBe(false);
  });

  it('straights including Mah Jong and Phoenix', () => {
    expect(parseCombo([MAHJONG, c(2), c(3, 1), c(4), c(5)])).toMatchObject({ type: 'straight', rank: 5 });
    expect(parseCombo([c(2), c(3, 1), c(4), c(6, 2), PHOENIX])).toMatchObject({ type: 'straight', rank: 6, phoenixAs: 5 });
    // Phoenix extends at the top when no gap
    expect(parseCombo([c(9), c(10, 1), c(11), c(12, 2), PHOENIX])).toMatchObject({ type: 'straight', rank: 13 });
    expect(parseCombo([c(10), c(11, 1), c(12), c(13, 2), PHOENIX])).toMatchObject({ type: 'straight', rank: 14 });
    expect(parseCombo([c(11), c(12, 1), c(13), c(14, 2), PHOENIX])).toMatchObject({ type: 'straight', rank: 14, phoenixAs: 10 });
  });

  it('pair sequences', () => {
    expect(parseCombo([c(5), c(5, 1), c(6), c(6, 2)])).toMatchObject({ type: 'pairseq', rank: 6 });
    expect(parseCombo([c(5), c(5, 1), c(7), c(7, 2)])).toBeNull();
    expect(parseCombo([c(5), c(5, 1), c(6), PHOENIX])).toMatchObject({ type: 'pairseq', rank: 6 });
  });

  it('bombs', () => {
    const four = parseCombo([c(3), c(3, 1), c(3, 2), c(3, 3)])!;
    expect(four.type).toBe('bomb4');
    const sf = parseCombo([c(2, 1), c(3, 1), c(4, 1), c(5, 1), c(6, 1)])!;
    expect(sf.type).toBe('bombsf');
    expect(beats(four, parseCombo([DRAGON]))).toBe(true);
    expect(beats(sf, four)).toBe(true);
    expect(beats(four, sf)).toBe(false);
    const longSf = parseCombo([c(2, 2), c(3, 2), c(4, 2), c(5, 2), c(6, 2), c(7, 2)])!;
    expect(beats(longSf, parseCombo([c(9, 3), c(10, 3), c(11, 3), c(12, 3), c(13, 3)])!)).toBe(true);
  });

  it('dog and dragon cannot combine', () => {
    expect(parseCombo([DOG, c(2)])).toBeNull();
    expect(parseCombo([DRAGON, PHOENIX])).toBeNull();
  });
});

describe('generateCandidates', () => {
  // brute force: every subset that parses
  function brute(hand: CardId[]): Set<string> {
    const out = new Set<string>();
    const n = hand.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const sub = hand.filter((_, i) => mask & (1 << i));
      if (parseCombo(sub)) out.add(comboKey(sub));
    }
    return out;
  }

  function seeded(seed: number) {
    let x = seed;
    return () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x / 0x7fffffff;
    };
  }

  it('matches brute force on random hands', () => {
    const r = seeded(42);
    for (let t = 0; t < 250; t++) {
      const deck = Array.from({ length: 56 }, (_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      // bias towards dense hands (few ranks, phoenix) to stress straights / stairs
      const size = 6 + Math.floor(r() * 8);
      let hand = deck.slice(0, size);
      if (t % 3 === 0 && !hand.includes(PHOENIX)) hand = [...hand.slice(1), PHOENIX];
      const gen = new Set(generateCandidates(hand).map(comboKey));
      const bf = brute(hand);
      expect([...gen].filter((k) => !bf.has(k))).toEqual([]);
      expect([...bf].filter((k) => !gen.has(k))).toEqual([]);
    }
  });
});

describe('wish', () => {
  it('forces a play containing the wished rank if possible', () => {
    const hand = [c(7), c(9), c(9, 1)];
    const top = parseCombo([c(5)]);
    const lp = legalPlays(hand, top, 7);
    expect(lp.mustFulfill).toBe(true);
    expect(lp.plays.map((p) => p.cards)).toEqual([[c(7)]]);
    // cannot beat with the 7 -> free choice
    const lp2 = legalPlays(hand, parseCombo([c(8)]), 7);
    expect(lp2.mustFulfill).toBe(false);
  });
});
