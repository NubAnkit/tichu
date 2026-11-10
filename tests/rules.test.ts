import { describe, expect, it } from 'vitest';
import { CardId, DOG, DRAGON, MAHJONG, PHOENIX } from '../src/engine/cards';
import { GameState, IllegalAction, applyAction, canCallTichu, newGame, pendingActors, playOptions } from '../src/engine/game';

const c = (rank: number, suit = 0): CardId => suit * 13 + (rank - 2);

/** Build a mid-round playing state with given hands (p0 leads unless turn given). */
function setup(hands: CardId[][], opts: Partial<GameState> = {}): GameState {
  const s = newGame({ seed: 1 });
  s.phase = 'playing';
  s.hands = hands.map((h) => [...h]);
  s.hasPlayed = [true, true, true, true];
  s.turn = 0;
  return Object.assign(s, opts);
}

function seeded(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function totalCards(s: GameState) {
  const all = [
    ...s.hands.flat(),
    ...s.undealt.flat(),
    ...s.tricksWon.flat(),
    ...s.trick.flatMap((t) => t.combo.cards),
    ...(s.dragonPending?.cards ?? []),
  ];
  return all;
}

describe('rule edge cases', () => {
  it('Dog passes the lead to partner, or the next active player if partner is out', () => {
    let s = setup([[DOG, c(3)], [c(4)], [], [c(6)]], { finished: [2] });
    s = applyAction(s, { type: 'play', player: 0, cards: [DOG] });
    expect(s.turn).toBe(3); // partner (2) out -> next after partner
    let t = setup([[DOG, c(3)], [c(4)], [c(5)], [c(6)]]);
    t = applyAction(t, { type: 'play', player: 0, cards: [DOG] });
    expect(t.turn).toBe(2);
    expect(() => applyAction(setup([[c(2)], [DOG], [c(5)], [c(6)]], { turn: 0 }), { type: 'play', player: 0, cards: [c(2)] }))
      .not.toThrow();
  });

  it('Dog cannot be played on a trick', () => {
    let s = setup([[c(3), c(9)], [DOG, c(2, 1)], [c(5)], [c(6)]]);
    s = applyAction(s, { type: 'play', player: 0, cards: [c(3)] });
    expect(() => applyAction(s, { type: 'play', player: 1, cards: [DOG] })).toThrow(IllegalAction);
  });

  it('trick won by a player who went out passes the lead to the next active player', () => {
    let s = setup([[c(14)], [c(3), c(4)], [c(5), c(6)], [c(7), c(8)]]);
    s = applyAction(s, { type: 'play', player: 0, cards: [c(14)] });
    expect(s.finished).toEqual([0]);
    s = applyAction(s, { type: 'pass', player: 1 });
    s = applyAction(s, { type: 'pass', player: 2 });
    expect(s.trick.length).toBe(1);
    s = applyAction(s, { type: 'pass', player: 3 });
    expect(s.trick.length).toBe(0);
    expect(s.tricksWon[0]).toContain(c(14));
    expect(s.turn).toBe(1);
  });

  it('out-of-turn bombs are allowed and play continues after the bomber', () => {
    let s = setup([[c(9), c(2)], [c(10), c(3)], [c(5), c(5, 1), c(5, 2), c(5, 3), c(7)], [c(8), c(4)]]);
    s = applyAction(s, { type: 'play', player: 0, cards: [c(9)] });
    // Player 3 is not on turn and has no bomb
    expect(() => applyAction(s, { type: 'play', player: 3, cards: [c(8)] })).toThrow(IllegalAction);
    expect(playOptions(s, 2).plays.map((p) => p.type)).toEqual(['bomb4']);
    s = applyAction(s, { type: 'play', player: 2, cards: [c(5), c(5, 1), c(5, 2), c(5, 3)] });
    expect(s.lastPlayer).toBe(2);
    expect(s.turn).toBe(3);
  });

  it('the wish forbids passing while you hold a playable wished card', () => {
    let s = setup([[MAHJONG, c(3)], [c(7), c(9)], [c(5)], [c(6)]]);
    s = applyAction(s, { type: 'play', player: 0, cards: [MAHJONG], wish: 7 });
    expect(s.wish).toBe(7);
    expect(() => applyAction(s, { type: 'pass', player: 1 })).toThrow(/wish/);
    expect(() => applyAction(s, { type: 'play', player: 1, cards: [c(9)] })).toThrow(/wish/);
    s = applyAction(s, { type: 'play', player: 1, cards: [c(7)] });
    expect(s.wish).toBeNull();
  });

  it('the Dragon trick must go to an opponent', () => {
    let s = setup([[DRAGON, c(3)], [c(4), c(2, 1)], [c(5), c(2, 2)], [c(6), c(2, 3)]]);
    s = applyAction(s, { type: 'play', player: 0, cards: [DRAGON] });
    s = applyAction(s, { type: 'pass', player: 1 });
    s = applyAction(s, { type: 'pass', player: 2 });
    s = applyAction(s, { type: 'pass', player: 3 });
    expect(s.phase).toBe('dragonGive');
    expect(pendingActors(s)).toEqual([0]);
    expect(() => applyAction(s, { type: 'giveDragon', player: 0, to: 2 })).toThrow(IllegalAction);
    s = applyAction(s, { type: 'giveDragon', player: 0, to: 3 });
    expect(s.tricksWon[3]).toContain(DRAGON);
    expect(s.turn).toBe(0);
  });

  it('scores a double victory and Tichu calls', () => {
    let s = setup([[c(14)], [c(3), c(4)], [c(13)], [c(7), c(8)]], { calls: ['tichu', 'none', 'none', 'grand'] });
    s = applyAction(s, { type: 'play', player: 0, cards: [c(14)] });
    s = applyAction(s, { type: 'pass', player: 1 });
    s = applyAction(s, { type: 'pass', player: 2 });
    s = applyAction(s, { type: 'pass', player: 3 });
    expect(s.turn).toBe(1);
    s = applyAction(s, { type: 'play', player: 1, cards: [c(3)] });
    s = applyAction(s, { type: 'play', player: 2, cards: [c(13)] });
    expect(s.phase).toBe('roundOver');
    const r = s.history[0];
    expect(r.doubleVictory).toBe(0);
    expect(r.total).toEqual([300, -200]);
  });

  it("last player's hand goes to the opponents and their tricks to the winner", () => {
    // p0 out first, p1 second, p2 third -> p3 last holding the Phoenix and a K
    let s = setup([[c(2)], [c(3)], [c(4)], [PHOENIX, c(13, 3)]]);
    s.tricksWon[3] = [c(10, 3)]; // 10 points sitting in last player's tricks
    s = applyAction(s, { type: 'play', player: 0, cards: [c(2)] });
    s = applyAction(s, { type: 'play', player: 1, cards: [c(3)] });
    s = applyAction(s, { type: 'play', player: 2, cards: [c(4)] });
    expect(s.phase).toBe('roundOver');
    const r = s.history[0];
    // team 0 gets p3's hand (-25 + 10) + p3's tricks via p0 (10); team 1 gets nothing
    expect(r.cardPoints).toEqual([-5, 0]);
  });

  it('Tichu may only be called before playing a card', () => {
    const s = setup([[c(2)], [c(3)], [c(4)], [c(5)]]);
    s.hasPlayed = [false, true, false, false];
    s.hands[0] = Array.from({ length: 14 }, (_, i) => i);
    expect(canCallTichu(s, 0)).toBe(true);
    expect(canCallTichu(s, 1)).toBe(false);
  });
});

describe('random fuzzing', () => {
  it('random legal play never breaks invariants', () => {
    const rnd = seeded(12345);
    let actions = 0;
    for (let g = 0; g < 30; g++) {
      let s = newGame({ seed: g + 1, targetScore: 500 });
      let guard = 0;
      while (s.phase !== 'gameOver') {
        if (++guard > 50000) throw new Error('stuck');
        expect(totalCards(s).sort((a, b) => a - b)).toEqual(Array.from({ length: 56 }, (_, i) => i));
        let a;
        if (s.phase === 'roundOver') a = { type: 'nextRound' as const };
        else if (s.phase === 'grandTichu') {
          const p = pendingActors(s)[0];
          a = { type: 'grandTichu' as const, player: p, call: rnd() < 0.05 };
        } else if (s.phase === 'passing') {
          const p = pendingActors(s)[0];
          if (canCallTichu(s, p) && rnd() < 0.1) a = { type: 'tichu' as const, player: p };
          else {
            const h = [...s.hands[p]].sort(() => rnd() - 0.5);
            a = { type: 'passCards' as const, player: p, cards: [h[0], h[1], h[2]] as [number, number, number] };
          }
        } else if (s.phase === 'dragonGive') {
          const p = s.dragonPending!.winner;
          a = { type: 'giveDragon' as const, player: p, to: (p + (rnd() < 0.5 ? 1 : 3)) % 4 };
        } else {
          // maybe a random out-of-turn bomb
          const bombers = [0, 1, 2, 3].filter((p) => p !== s.turn && playOptions(s, p).plays.length);
          if (bombers.length && rnd() < 0.3) {
            const p = bombers[Math.floor(rnd() * bombers.length)];
            const plays = playOptions(s, p).plays;
            a = { type: 'play' as const, player: p, cards: plays[Math.floor(rnd() * plays.length)].cards };
          } else {
            const p = s.turn;
            const o = playOptions(s, p);
            if (canCallTichu(s, p) && rnd() < 0.05) a = { type: 'tichu' as const, player: p };
            else if (o.canPass && (rnd() < 0.4 || !o.plays.length)) a = { type: 'pass' as const, player: p };
            else {
              expect(o.plays.length).toBeGreaterThan(0); // never stuck
              const pick = o.plays[Math.floor(rnd() * o.plays.length)];
              const wish = pick.cards.includes(MAHJONG) && rnd() < 0.7 ? 2 + Math.floor(rnd() * 13) : null;
              a = { type: 'play' as const, player: p, cards: pick.cards, wish };
            }
          }
        }
        s = applyAction(s, a);
        actions++;
      }
      for (const r of s.history) {
        if (r.doubleVictory === null) expect(r.cardPoints[0] + r.cardPoints[1]).toBe(100);
      }
    }
    expect(actions).toBeGreaterThan(1000);
  }, 120000);
});
