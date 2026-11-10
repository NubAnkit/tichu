import { CardId, cardPoints } from './cards';
import { Combo, legalPlays, isBomb } from './combos';
import { Call, GameState, Phase, Seat, TrickPlay, topCombo } from './game';

/** Everything a single seat is allowed to know. Bots only ever see this. */
export interface PlayerView {
  me: Seat;
  phase: Phase;
  round: number;
  hand: CardId[];
  handCounts: number[];
  calls: Call[];
  grandDecided: boolean[];
  hasPlayed: boolean[];
  myPass: [CardId, CardId, CardId] | null;
  received: [CardId, CardId, CardId] | null;
  trick: TrickPlay[];
  top: Combo | null;
  lastPlayer: Seat | null;
  turn: Seat;
  wish: number | null;
  finished: Seat[];
  played: CardId[];
  /** Points each seat has collected in tricks so far (public: tricks are visible as they're won). */
  trickPoints: number[];
  dragonWinner: Seat | null;
  scores: [number, number];
  targetScore: number;
}

export function viewFor(s: GameState, p: Seat): PlayerView {
  return {
    me: p,
    phase: s.phase,
    round: s.round,
    hand: [...s.hands[p]],
    handCounts: s.hands.map((h) => h.length),
    calls: [...s.calls],
    grandDecided: [...s.grandDecided],
    hasPlayed: [...s.hasPlayed],
    myPass: s.passChoices[p],
    received: s.received[p],
    trick: s.trick.map((t) => ({ ...t })),
    top: topCombo(s),
    lastPlayer: s.lastPlayer,
    turn: s.turn,
    wish: s.wish,
    finished: [...s.finished],
    played: [...s.played],
    trickPoints: s.tricksWon.map((t) => cardPoints(t)),
    dragonWinner: s.dragonPending?.winner ?? null,
    scores: [...s.scores] as [number, number],
    targetScore: s.targetScore,
  };
}

export const viewIsActive = (v: PlayerView, p: Seat) => !v.finished.includes(p);

export function viewOptions(v: PlayerView): { plays: Combo[]; canPass: boolean; mustFulfill: boolean } {
  if (v.phase !== 'playing' || !viewIsActive(v, v.me)) return { plays: [], canPass: false, mustFulfill: false };
  if (v.turn === v.me) {
    const lp = legalPlays(v.hand, v.top, v.wish);
    return { plays: lp.plays, canPass: v.top !== null && !lp.mustFulfill, mustFulfill: lp.mustFulfill };
  }
  if (!v.top) return { plays: [], canPass: false, mustFulfill: false };
  return { plays: legalPlays(v.hand, v.top, null).plays.filter(isBomb), canPass: false, mustFulfill: false };
}
