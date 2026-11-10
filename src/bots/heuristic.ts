import { CARDS, CardId, DOG, DRAGON, MAHJONG, PHOENIX, cardName, cardPoints, rankLabel } from '../engine/cards';
import { Combo, comboKey, describeCombo, isBomb, parseCombo } from '../engine/combos';
import { Seat, leftOf, partnerOf, rightOf, team } from '../engine/game';
import { PlayerView, viewIsActive, viewOptions } from '../engine/view';
import { comboStrength, countingWinProb, planCost, planHand, unseenCards } from './analysis';
import type { Bot, BotLevel, Decision } from './types';

const SEAT_NAMES = ['South', 'East', 'North', 'West'];
export const seatName = (p: Seat) => SEAT_NAMES[p];

function minus(cards: readonly CardId[], remove: readonly CardId[]) {
  const set = new Set(remove);
  return cards.filter((c) => !set.has(c));
}

const opponents = (me: Seat) => [rightOf(me), leftOf(me)];

/** Grand Tichu score for an 8-card hand. */
function grandScore(hand: CardId[]): number {
  let s = 0;
  const counts = new Map<number, number>();
  for (const id of hand) {
    if (id === DRAGON) s += 1.2;
    else if (id === PHOENIX) s += 1.1;
    else if (CARDS[id].suit) {
      const r = CARDS[id].rank;
      counts.set(r, (counts.get(r) ?? 0) + 1);
      if (r === 14) s += 0.75;
      else if (r === 13) s += 0.25;
    }
  }
  for (const n of counts.values()) if (n === 4) s += 1.5;
  return s;
}

/** How confident are we that this 14-card hand goes out first? */
export function tichuAssessment(hand: CardId[]): { call: boolean; winners: number; losers: number; summary: string } {
  const plan = planHand(hand);
  let winners = 0;
  let losers = 0;
  for (const c of plan.combos) {
    const s = comboStrength(c);
    if (isBomb(c)) winners += 1.5;
    else if (s >= 0.7) winners += 1;
    else if (s < 0.45) losers += 1;
  }
  if (hand.includes(DOG)) losers -= 0.5; // dog is a free way to shed one card (it hands over the lead)
  const call = winners >= 2.5 && losers <= winners - 0.5 && plan.combos.length <= 8;
  return {
    call,
    winners,
    losers,
    summary: `${plan.combos.length} combos: ~${winners} likely winners vs ~${Math.max(0, losers)} weak ones`,
  };
}

export class HeuristicBot implements Bot {
  constructor(readonly level: BotLevel) {}

  private get counting() {
    return this.level === 'hard';
  }

  // -------------------------------------------------------------------------
  grandTichu(v: PlayerView): Decision {
    const s = grandScore(v.hand);
    const threshold = this.level === 'hard' ? 3.3 : 3.5;
    const partnerGrand = v.calls[partnerOf(v.me)] === 'grand';
    if (this.level !== 'easy' && s >= threshold && !partnerGrand) {
      return {
        action: { type: 'grandTichu', player: v.me, call: true },
        reason: `My first 8 cards are huge (score ${s.toFixed(1)}): Dragon/Phoenix/Aces/bomb. Going for Grand Tichu.`,
      };
    }
    return {
      action: { type: 'grandTichu', player: v.me, call: false },
      reason: `First 8 cards score ${s.toFixed(1)}; Grand Tichu needs ~${threshold}+. Waiting to see the full hand.`,
    };
  }

  tichu(v: PlayerView): Decision | null {
    if (this.level === 'easy') return null;
    if (v.calls[v.me] !== 'none' || v.hasPlayed[v.me] || v.hand.length !== 14) return null;
    if (v.calls[partnerOf(v.me)] !== 'none') return null; // don't double up with partner
    const a = tichuAssessment(v.hand);
    // Hard bots are a bit bolder when someone on the other team already called (block + score).
    const oppCalled = opponents(v.me).some((p) => v.calls[p] !== 'none');
    const bold = this.level === 'hard' && !oppCalled && a.winners >= 3 && a.losers <= a.winners;
    if (!a.call && !bold) return null;
    return { action: { type: 'tichu', player: v.me }, reason: `Calling Tichu: ${a.summary}.` };
  }

  // -------------------------------------------------------------------------
  passCards(v: PlayerView): Decision {
    const hand = v.hand;
    const me = v.me;
    if (this.level === 'easy') {
      const low = [...hand].filter((c) => c !== DRAGON && c !== PHOENIX).slice(0, 3);
      return {
        action: { type: 'passCards', player: me, cards: [low[0], low[2], low[1]] },
        reason: 'Passing my three lowest cards.',
      };
    }
    const partnerCalled = v.calls[partnerOf(me)] !== 'none';
    const iCall = v.calls[me] !== 'none' || tichuAssessment(hand).call;
    const plan = planHand(hand);
    const inMulti = new Set(plan.combos.filter((c) => c.length > 1).flatMap((c) => c.cards));
    const inBomb = new Set(plan.combos.filter(isBomb).flatMap((c) => c.cards));

    // --- to partner
    let toPartner: CardId;
    let partnerWhy: string;
    const highSingles = [...hand]
      .filter((c) => !inBomb.has(c) && c !== DOG && c !== MAHJONG)
      .sort((a, b) => CARDS[b].rank - CARDS[a].rank || (inMulti.has(a) ? 1 : 0) - (inMulti.has(b) ? 1 : 0));
    if (partnerCalled) {
      toPartner = highSingles[0];
      partnerWhy = `my best card (${cardName(toPartner)}) to my partner because they called Tichu`;
    } else if (iCall) {
      const giveDog = hand.includes(DOG);
      toPartner = giveDog ? DOG : [...hand].filter((c) => !inMulti.has(c) && c !== MAHJONG && c !== PHOENIX && c !== DRAGON)[0] ?? hand[0];
      partnerWhy = giveDog
        ? 'the Dog to my partner so they can hand the lead back to me (I plan to call Tichu)'
        : `a low card (${cardName(toPartner)}) to my partner since I want to keep my strength for Tichu`;
    } else {
      toPartner = highSingles.find((c) => c !== DRAGON && c !== PHOENIX) ?? highSingles[0];
      partnerWhy = `a strong card (${cardName(toPartner)}) to help my partner`;
    }

    // --- to opponents: lowest lone cards, avoid point cards & specials they'd enjoy
    const pool = [...hand]
      .filter((c) => c !== toPartner && !inBomb.has(c) && c !== DRAGON && c !== PHOENIX)
      .map((c) => {
        const info = CARDS[c];
        let score = info.suit ? info.rank : c === DOG ? 1.5 : 30; // keep Mah Jong (lead control)
        if (inMulti.has(c)) score += 6;
        if (info.points > 0) score += 2.5;
        return { c, score };
      })
      .sort((a, b) => a.score - b.score);
    const [o1, o2] = [pool[0]?.c, pool[1]?.c];
    const fallback = hand.filter((c) => c !== toPartner && c !== o1 && c !== o2);
    const toLeft = o1 ?? fallback[0];
    const toRight = o2 ?? fallback.find((c) => c !== toLeft)!;
    return {
      action: { type: 'passCards', player: me, cards: [toLeft, toPartner, toRight] },
      reason: `Passing ${partnerWhy}; opponents get my weakest loose cards (${cardName(toLeft)}, ${cardName(toRight)}).`,
    };
  }

  // -------------------------------------------------------------------------
  giveDragon(v: PlayerView): Decision {
    const [a, b] = opponents(v.me);
    const pick = (p: Seat) => (viewIsActive(v, p) ? v.handCounts[p] : -1);
    // The opponent likely to finish last has to hand their tricks to the winner,
    // so give it to whoever has the most cards left.
    const to = pick(a) >= pick(b) ? a : b;
    return {
      action: { type: 'giveDragon', player: v.me, to },
      reason: `Giving the Dragon trick to ${seatName(to)}: they have the most cards, so they're most likely to finish last and lose these points.`,
    };
  }

  // -------------------------------------------------------------------------
  private winProb(v: PlayerView, c: Combo): number {
    if (!this.counting) return Math.min(1, comboStrength(c));
    const oppCards = opponents(v.me)
      .filter((p) => viewIsActive(v, p))
      .reduce((a, p) => a + v.handCounts[p], 0);
    return countingWinProb(c, unseenCards(v.hand, v.played), oppCards);
  }

  private chooseWish(v: PlayerView, combo: Combo): { wish: number | null; why: string } {
    if (!combo.cards.includes(MAHJONG) || this.level === 'easy') return { wish: null, why: '' };
    const mine = new Set(v.hand.filter((c) => CARDS[c].suit).map((c) => CARDS[c].rank));
    if (v.myPass) {
      const passedToOpp = [v.myPass[0], v.myPass[2]].filter((c) => CARDS[c].suit && !mine.has(CARDS[c].rank));
      if (passedToOpp.length) {
        const r = Math.max(...passedToOpp.map((c) => CARDS[c].rank));
        return { wish: r, why: ` Wishing for ${rankLabel(r)} — I passed one to an opponent, so they must break their hand to play it.` };
      }
    }
    if (this.counting) {
      for (let r = 14; r >= 10; r--) {
        if (!mine.has(r)) return { wish: r, why: ` Wishing for ${rankLabel(r)} to drain a high card I don't hold.` };
      }
    }
    return { wish: null, why: '' };
  }

  private playDecision(v: PlayerView, combo: Combo, reason: string): Decision {
    const w = this.chooseWish(v, combo);
    return { action: { type: 'play', player: v.me, cards: combo.cards, wish: w.wish }, reason: reason + w.why };
  }

  private urgency(v: PlayerView): { level: number; why: string } {
    let level = 0;
    let why = '';
    for (const p of opponents(v.me)) {
      if (!viewIsActive(v, p)) continue;
      const n = v.handCounts[p];
      const calledAlive = v.calls[p] !== 'none' && v.finished.length === 0;
      if (calledAlive && n <= 5) {
        level = Math.max(level, 2);
        why = `${seatName(p)} called Tichu and has only ${n} cards`;
      } else if (n <= 2 && level < 2) {
        level = Math.max(level, 1.5);
        why = `${seatName(p)} is down to ${n} card${n === 1 ? '' : 's'}`;
      } else if (calledAlive && level < 1) {
        level = 1;
        why = `${seatName(p)} called Tichu`;
      }
    }
    return { level, why };
  }

  play(v: PlayerView): Decision {
    const opts = viewOptions(v);
    const me = v.me;
    const pass = (reason: string): Decision => ({ action: { type: 'pass', player: me }, reason });
    if (!opts.plays.length) return pass(v.top ? `Nothing in my hand beats ${describeCombo(v.top)}.` : 'No legal plays.');

    if (this.level === 'easy') return this.easyPlay(v, opts.plays, opts.canPass);

    // Going out with one play is always right (prefer not wasting a bomb).
    const out = opts.plays.filter((c) => c.length === v.hand.length).sort((a, b) => Number(isBomb(a)) - Number(isBomb(b)));
    if (out.length) {
      return this.playDecision(v, out[0], `${describeCombo(out[0])} is my whole hand — going out!`);
    }

    if (opts.mustFulfill) {
      const best = this.bestFollow(v, opts.plays, true) ?? { combo: opts.plays[0], value: 0 };
      return this.playDecision(v, best.combo, `The Mah Jong wish forces me to play a ${rankLabel(v.wish!)}: ${describeCombo(best.combo)}.`);
    }
    return v.top ? this.follow(v, opts.plays, opts.canPass) : this.lead(v, opts.plays);
  }

  private easyPlay(v: PlayerView, plays: Combo[], canPass: boolean): Decision {
    const me = v.me;
    const partnerWinning = v.lastPlayer !== null && team(v.lastPlayer) === team(me);
    if (canPass && partnerWinning) return { action: { type: 'pass', player: me }, reason: 'My partner is winning; passing.' };
    const nonBomb = plays.filter((c) => !isBomb(c));
    const list = nonBomb.length ? nonBomb : canPass ? [] : plays;
    if (!list.length) return { action: { type: 'pass', player: me }, reason: 'Only bombs left; saving them.' };
    // lowest rank, then longest (sheds more cards)
    const pick = [...list].sort((a, b) => a.rank - b.rank || b.length - a.length)[0];
    return { action: { type: 'play', player: me, cards: pick.cards, wish: null }, reason: `Playing my lowest option: ${describeCombo(pick)}.` };
  }

  private lead(v: PlayerView, plays: Combo[]): Decision {
    const me = v.me;
    const partner = partnerOf(me);
    const partnerActive = viewIsActive(v, partner);
    const legal = new Map(plays.map((c) => [comboKey(c.cards), c]));
    const hasDog = v.hand.includes(DOG);
    const iCalled = v.calls[me] !== 'none';

    if (partnerActive && hasDog && !iCalled) {
      if (v.calls[partner] !== 'none') {
        return this.playDecision(v, parseCombo([DOG])!, 'Leading the Dog to pass the lead to my partner, who called Tichu.');
      }
      if (v.handCounts[partner] <= 2) {
        return this.playDecision(v, parseCombo([DOG])!, `Leading the Dog: my partner has ${v.handCounts[partner]} card(s) and can go out from the lead.`);
      }
    }
    if (partnerActive && v.handCounts[partner] === 1 && !iCalled) {
      const low = plays.filter((c) => c.type === 'single' && c.cards[0] !== DRAGON).sort((a, b) => a.rank - b.rank)[0];
      if (low) return this.playDecision(v, low, 'My partner has one card left — leading a low single so they can go out.');
    }

    const plan = planHand(v.hand);
    const planned = plan.combos.map((c) => legal.get(comboKey(c.cards))).filter((c): c is Combo => !!c);
    const candidates = planned.length ? planned : plays;
    const opps = opponents(me).filter((p) => viewIsActive(v, p));
    const minOpp = Math.min(...opps.map((p) => v.handCounts[p]), 99);

    // With two combos left and one is a near-certain winner, cash the winner first.
    if (planned.length === 2) {
      const sorted = [...planned].sort((a, b) => this.winProb(v, b) - this.winProb(v, a));
      if (this.winProb(v, sorted[0]) >= 0.9 && sorted[0].type !== 'dog') {
        return this.playDecision(v, sorted[0], `Two plays left: cashing ${describeCombo(sorted[0])} (very likely unbeatable) to keep the lead.`);
      }
    }

    let best: Combo | null = null;
    let bestScore = -Infinity;
    for (const c of candidates) {
      if (isBomb(c) && candidates.some((x) => !isBomb(x))) continue;
      let score = 1 - comboStrength(c) + 0.12 * (c.length - 1);
      if (c.cards.includes(MAHJONG)) score += 0.4; // get the Mah Jong out early
      if (c.type === 'dog') score = partnerActive && !iCalled ? 0.55 : -1;
      // don't feed an opponent who is about to go out with a combo they can match
      if (minOpp <= 2 && c.length <= minOpp) score -= 1;
      if (c.type === 'single' && minOpp === 1) score += c.rank / 15; // if forced, lead high singles
      if (score > bestScore) [best, bestScore] = [c, score];
    }
    best = best ?? candidates[0];
    let why = `Leading ${describeCombo(best)}`;
    if (minOpp <= 2) why += `, avoiding combos an opponent with ${minOpp} card(s) could match`;
    else if (comboStrength(best) < 0.45) why += ' to shed a weak part of my hand while I control the lead';
    else why += ' — my hand is strong enough to push for control';
    return this.playDecision(v, best, why + '.');
  }

  /** Evaluate following options: higher value = better. */
  private bestFollow(v: PlayerView, plays: Combo[], includeBombs: boolean): { combo: Combo; value: number; why: string } | null {
    const before = planCost(v.hand);
    const trickPts = cardPoints(v.trick.flatMap((t) => t.combo.cards));
    let best: { combo: Combo; value: number; why: string } | null = null;
    for (const c of plays) {
      if (!includeBombs && isBomb(c)) continue;
      const after = planCost(minus(v.hand, c.cards));
      const shed = before - after; // how much "badness" leaves the hand
      const pw = this.winProb(v, c);
      let pts = (trickPts + cardPoints(c.cards)) / 50;
      if (c.cards[0] === DRAGON && c.type === 'single') pts = -(trickPts + 25) / 50; // Dragon tricks go to opponents
      const value = shed + pw * (0.35 + pts);
      const why = shed < 0 ? 'even though it breaks up my hand' : 'it fits my hand plan';
      if (!best || value > best.value) best = { combo: c, value, why };
    }
    return best;
  }

  private follow(v: PlayerView, plays: Combo[], canPass: boolean): Decision {
    const me = v.me;
    const last = v.lastPlayer!;
    const pass = (reason: string): Decision => ({ action: { type: 'pass', player: me }, reason });
    const topDesc = describeCombo(v.top!);
    const partnerWinning = team(last) === team(me);

    if (partnerWinning && canPass) {
      return pass(`My partner (${seatName(last)}) is winning with ${topDesc}; no need to overtake.`);
    }

    const urg = this.urgency(v);
    const best = this.bestFollow(v, plays, false);
    const threshold = urg.level >= 1.5 ? -5 : urg.level >= 1 ? 0 : 0.15;
    if (best && best.value > threshold) {
      const ctx = urg.level >= 1.5 ? ` — must contest: ${urg.why}` : ` — ${best.why}`;
      return this.playDecision(v, best.combo, `Beating ${topDesc} with ${describeCombo(best.combo)}${ctx}.`);
    }

    const bombs = plays.filter(isBomb).sort((a, b) => a.length - b.length || a.rank - b.rank);
    if (bombs.length) {
      const trickPts = cardPoints(v.trick.flatMap((t) => t.combo.cards));
      const goOutSoon = planHand(minus(v.hand, bombs[0].cards)).combos.length <= 1;
      if (urg.level >= 1.5 || trickPts >= 25 || goOutSoon) {
        const why = urg.level >= 1.5 ? urg.why : trickPts >= 25 ? `the trick is worth ${trickPts} points` : 'it sets me up to go out';
        return this.playDecision(v, bombs[0], `Bombing (${describeCombo(bombs[0])}) because ${why}.`);
      }
    }
    if (!canPass) return this.playDecision(v, best?.combo ?? plays[0], `Forced to play: ${describeCombo(best?.combo ?? plays[0])}.`);
    if (best) return pass(`I could beat ${topDesc}, but it would cost too much of my hand.`);
    return pass(`Holding my bomb; beating ${topDesc} isn't worth it yet.`);
  }

  // -------------------------------------------------------------------------
  bomb(v: PlayerView): Decision | null {
    if (this.level === 'easy') return null;
    if (v.lastPlayer === null || team(v.lastPlayer) === team(v.me)) return null;
    const opts = viewOptions(v);
    const bombs = opts.plays.filter(isBomb).sort((a, b) => a.length - b.length || a.rank - b.rank);
    if (!bombs.length) return null;
    const winner = v.lastPlayer;
    const n = v.handCounts[winner];
    const trickPts = cardPoints(v.trick.flatMap((t) => t.combo.cards));
    const calledAlive = v.calls[winner] !== 'none' && v.finished.length === 0;
    const partnerCalled = v.calls[partnerOf(v.me)] !== 'none' && v.finished.length === 0 && viewIsActive(v, partnerOf(v.me));
    let why: string | null = null;
    if (!viewIsActive(v, winner)) return null;
    if (n === 0) return null;
    if (calledAlive && n <= 4) why = `${seatName(winner)} called Tichu and would take the lead with ${n} cards left`;
    else if (n <= 2) why = `${seatName(winner)} would take the lead with only ${n} card(s) left`;
    else if (partnerCalled && this.level === 'hard' && n <= 6) why = `protecting my partner's Tichu`;
    else if (trickPts >= 30) why = `this trick is worth ${trickPts} points`;
    if (!why) return null;
    return {
      action: { type: 'play', player: v.me, cards: bombs[0].cards, wish: null },
      reason: `Out-of-turn BOMB (${describeCombo(bombs[0])}): ${why}.`,
    };
  }
}

export function makeBot(level: BotLevel): Bot {
  return new HeuristicBot(level);
}
