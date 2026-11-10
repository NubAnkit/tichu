import { ALL_CARDS, CardId, DOG, DRAGON, MAHJONG, cardPoints, sortCards } from './cards';
import { Combo, beats, containsRank, isBomb, legalPlays, parseCombo } from './combos';

/*
 * Seats are numbered 0..3 in turn order (play moves to the right / counter-clockwise).
 * From seat p's point of view: right = p+1, partner = p+2, left = p+3.
 * Teams: 0 = seats 0 & 2, 1 = seats 1 & 3.
 */
export type Seat = number;
export type Phase = 'grandTichu' | 'passing' | 'playing' | 'dragonGive' | 'roundOver' | 'gameOver';
export type Call = 'none' | 'tichu' | 'grand';

export const team = (p: Seat) => p % 2;
export const partnerOf = (p: Seat) => (p + 2) % 4;
export const rightOf = (p: Seat) => (p + 1) % 4;
export const leftOf = (p: Seat) => (p + 3) % 4;

export type Action =
  | { type: 'grandTichu'; player: Seat; call: boolean }
  | { type: 'tichu'; player: Seat }
  /** cards = [toLeft, toPartner, toRight] */
  | { type: 'passCards'; player: Seat; cards: [CardId, CardId, CardId] }
  | { type: 'play'; player: Seat; cards: CardId[]; wish?: number | null }
  | { type: 'pass'; player: Seat }
  | { type: 'giveDragon'; player: Seat; to: Seat }
  | { type: 'nextRound' };

export interface TrickPlay {
  player: Seat;
  combo: Combo;
}

export interface RoundResult {
  round: number;
  cardPoints: [number, number];
  tichuPoints: [number, number];
  total: [number, number];
  doubleVictory: number | null;
  finished: Seat[];
  calls: Call[];
}

export type GameEventBody =
  | { kind: 'deal'; round: number }
  | { kind: 'call'; player: Seat; call: 'tichu' | 'grand' }
  | { kind: 'exchange' }
  | { kind: 'play'; player: Seat; combo: Combo; outOfTurn: boolean }
  | { kind: 'pass'; player: Seat }
  | { kind: 'wish'; player: Seat; rank: number | null }
  | { kind: 'wishFulfilled'; player: Seat; rank: number }
  | { kind: 'dog'; player: Seat; to: Seat }
  | { kind: 'trick'; winner: Seat; to: Seat; cards: CardId[]; points: number }
  | { kind: 'out'; player: Seat; place: number }
  | { kind: 'roundEnd'; result: RoundResult }
  | { kind: 'gameOver'; winner: number };
export type GameEvent = GameEventBody & { id: number };

export interface GameState {
  rng: number;
  round: number;
  targetScore: number;
  phase: Phase;
  hands: CardId[][];
  /** The 6 cards each player gets after the Grand Tichu decision. */
  undealt: CardId[][];
  calls: Call[];
  grandDecided: boolean[];
  /** passChoices[p] = [toLeft, toPartner, toRight] once chosen. */
  passChoices: ([CardId, CardId, CardId] | null)[];
  /** received[p] = [fromLeft, fromPartner, fromRight] after the exchange. */
  received: ([CardId, CardId, CardId] | null)[];
  hasPlayed: boolean[];
  trick: TrickPlay[];
  lastPlayer: Seat | null;
  passCount: number;
  turn: Seat;
  wish: number | null;
  finished: Seat[];
  tricksWon: CardId[][];
  dragonPending: { winner: Seat; cards: CardId[] } | null;
  /** All cards played this round, in order (public information). */
  played: CardId[];
  scores: [number, number];
  history: RoundResult[];
  events: GameEvent[];
  nextEventId: number;
}

export class IllegalAction extends Error {}

// ---------------------------------------------------------------------------
// RNG (mulberry32, state kept in GameState so games are reproducible)
// ---------------------------------------------------------------------------
function rand(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function emit(s: GameState, e: GameEventBody) {
  s.events.push({ ...e, id: s.nextEventId++ } as GameEvent);
  if (s.events.length > 300) s.events.splice(0, s.events.length - 300);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export interface NewGameOptions {
  seed?: number;
  targetScore?: number;
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const s: GameState = {
    rng: (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    round: 0,
    targetScore: opts.targetScore ?? 1000,
    phase: 'grandTichu',
    hands: [[], [], [], []],
    undealt: [[], [], [], []],
    calls: ['none', 'none', 'none', 'none'],
    grandDecided: [false, false, false, false],
    passChoices: [null, null, null, null],
    received: [null, null, null, null],
    hasPlayed: [false, false, false, false],
    trick: [],
    lastPlayer: null,
    passCount: 0,
    turn: 0,
    wish: null,
    finished: [],
    tricksWon: [[], [], [], []],
    dragonPending: null,
    played: [],
    scores: [0, 0],
    history: [],
    events: [],
    nextEventId: 1,
  };
  deal(s);
  return s;
}

function deal(s: GameState) {
  const deck = [...ALL_CARDS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  s.round += 1;
  s.phase = 'grandTichu';
  for (let p = 0; p < 4; p++) {
    const mine = deck.slice(p * 14, p * 14 + 14);
    s.hands[p] = sortCards(mine.slice(0, 8));
    s.undealt[p] = mine.slice(8);
  }
  s.calls = ['none', 'none', 'none', 'none'];
  s.grandDecided = [false, false, false, false];
  s.passChoices = [null, null, null, null];
  s.received = [null, null, null, null];
  s.hasPlayed = [false, false, false, false];
  s.trick = [];
  s.lastPlayer = null;
  s.passCount = 0;
  s.wish = null;
  s.finished = [];
  s.tricksWon = [[], [], [], []];
  s.dragonPending = null;
  s.played = [];
  emit(s, { kind: 'deal', round: s.round });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export const isActive = (s: GameState, p: Seat) => !s.finished.includes(p);

export function nextActive(s: GameState, p: Seat): Seat {
  for (let i = 1; i <= 4; i++) {
    const q = (p + i) % 4;
    if (isActive(s, q)) return q;
  }
  return p;
}

export const topCombo = (s: GameState): Combo | null => (s.trick.length ? s.trick[s.trick.length - 1].combo : null);

export function canCallTichu(s: GameState, p: Seat): boolean {
  return (s.phase === 'passing' || s.phase === 'playing' || s.phase === 'dragonGive') &&
    s.calls[p] === 'none' && !s.hasPlayed[p] && s.hands[p].length === 14;
}

/** Players the game is waiting on. */
export function pendingActors(s: GameState): Seat[] {
  switch (s.phase) {
    case 'grandTichu':
      return [0, 1, 2, 3].filter((p) => !s.grandDecided[p]);
    case 'passing':
      return [0, 1, 2, 3].filter((p) => !s.passChoices[p]);
    case 'playing':
      return [s.turn];
    case 'dragonGive':
      return [s.dragonPending!.winner];
    default:
      return [];
  }
}

/** Legal plays for the player on turn (or bombs for anyone else). */
export function playOptions(s: GameState, p: Seat): { plays: Combo[]; canPass: boolean; mustFulfill: boolean } {
  if (s.phase !== 'playing' || !isActive(s, p)) return { plays: [], canPass: false, mustFulfill: false };
  const top = topCombo(s);
  if (p === s.turn) {
    const lp = legalPlays(s.hands[p], top, s.wish);
    return { plays: lp.plays, canPass: top !== null && !lp.mustFulfill, mustFulfill: lp.mustFulfill };
  }
  if (!top) return { plays: [], canPass: false, mustFulfill: false };
  return { plays: legalPlays(s.hands[p], top, null).plays.filter(isBomb), canPass: false, mustFulfill: false };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------
export function applyAction(state: GameState, a: Action): GameState {
  const s = structuredClone(state);
  switch (a.type) {
    case 'grandTichu':
      doGrand(s, a.player, a.call);
      break;
    case 'tichu':
      if (!canCallTichu(s, a.player)) throw new IllegalAction('Cannot call Tichu now');
      s.calls[a.player] = 'tichu';
      emit(s, { kind: 'call', player: a.player, call: 'tichu' });
      break;
    case 'passCards':
      doPassCards(s, a.player, a.cards);
      break;
    case 'play':
      doPlay(s, a.player, a.cards, a.wish ?? null);
      break;
    case 'pass':
      doPass(s, a.player);
      break;
    case 'giveDragon':
      doGiveDragon(s, a.player, a.to);
      break;
    case 'nextRound':
      if (s.phase !== 'roundOver') throw new IllegalAction('Round is not over');
      deal(s);
      break;
  }
  return s;
}

function doGrand(s: GameState, p: Seat, call: boolean) {
  if (s.phase !== 'grandTichu' || s.grandDecided[p]) throw new IllegalAction('Not deciding Grand Tichu');
  s.grandDecided[p] = true;
  if (call) {
    s.calls[p] = 'grand';
    emit(s, { kind: 'call', player: p, call: 'grand' });
  }
  if (s.grandDecided.every(Boolean)) {
    for (let q = 0; q < 4; q++) {
      s.hands[q] = sortCards([...s.hands[q], ...s.undealt[q]]);
      s.undealt[q] = [];
    }
    s.phase = 'passing';
  }
}

function doPassCards(s: GameState, p: Seat, cards: [CardId, CardId, CardId]) {
  if (s.phase !== 'passing' || s.passChoices[p]) throw new IllegalAction('Not passing now');
  if (cards.length !== 3 || new Set(cards).size !== 3 || !cards.every((c) => s.hands[p].includes(c))) {
    throw new IllegalAction('Must pass 3 distinct cards from your hand');
  }
  s.passChoices[p] = [...cards] as [CardId, CardId, CardId];
  if (!s.passChoices.every(Boolean)) return;

  const pc = s.passChoices as [CardId, CardId, CardId][];
  for (let q = 0; q < 4; q++) s.hands[q] = s.hands[q].filter((c) => !pc[q].includes(c));
  for (let q = 0; q < 4; q++) {
    const fromLeft = pc[leftOf(q)][2]; // left neighbour passes to their right
    const fromPartner = pc[partnerOf(q)][1];
    const fromRight = pc[rightOf(q)][0]; // right neighbour passes to their left
    s.received[q] = [fromLeft, fromPartner, fromRight];
    s.hands[q] = sortCards([...s.hands[q], fromLeft, fromPartner, fromRight]);
  }
  s.phase = 'playing';
  s.turn = s.hands.findIndex((h) => h.includes(MAHJONG));
  emit(s, { kind: 'exchange' });
}

function removeCards(s: GameState, p: Seat, cards: CardId[]) {
  s.hands[p] = s.hands[p].filter((c) => !cards.includes(c));
  s.hasPlayed[p] = true;
  s.played.push(...cards);
}

function shouldRoundEnd(s: GameState): boolean {
  const f = s.finished;
  return f.length >= 3 || (f.length === 2 && team(f[0]) === team(f[1]));
}

function markOut(s: GameState, p: Seat) {
  if (s.hands[p].length === 0 && !s.finished.includes(p)) {
    s.finished.push(p);
    emit(s, { kind: 'out', player: p, place: s.finished.length });
  }
}

function doPlay(s: GameState, p: Seat, cards: CardId[], wish: number | null) {
  if (s.phase !== 'playing') throw new IllegalAction('Not in play phase');
  if (!isActive(s, p)) throw new IllegalAction('Player is out');
  if (!cards.every((c) => s.hands[p].includes(c))) throw new IllegalAction('Cards not in hand');
  const top = topCombo(s);
  const combo = parseCombo(cards, top);
  if (!combo) throw new IllegalAction('Not a valid combination');
  const onTurn = p === s.turn;

  if (!onTurn) {
    if (!isBomb(combo) || !top || !beats(combo, top)) throw new IllegalAction('Only bombs can be played out of turn');
  } else {
    if (top && !beats(combo, top)) throw new IllegalAction('Does not beat the current trick');
    if (combo.type === 'dog' && top) throw new IllegalAction('Dog can only be led');
    if (s.wish !== null && !containsRank(combo.cards, s.wish)) {
      if (legalPlays(s.hands[p], top, s.wish).mustFulfill) {
        throw new IllegalAction(`You must fulfil the wish (${s.wish})`);
      }
    }
  }
  if (wish !== null && (!cards.includes(MAHJONG) || wish < 2 || wish > 14)) throw new IllegalAction('Bad wish');

  removeCards(s, p, combo.cards);

  if (combo.type === 'dog') {
    s.tricksWon[p].push(DOG);
    emit(s, { kind: 'play', player: p, combo, outOfTurn: false });
    markOut(s, p);
    const partner = partnerOf(p);
    const to = isActive(s, partner) ? partner : nextActive(s, partner);
    emit(s, { kind: 'dog', player: p, to });
    if (shouldRoundEnd(s)) return endRound(s);
    s.turn = to;
    return;
  }

  s.trick.push({ player: p, combo });
  s.lastPlayer = p;
  s.passCount = 0;
  emit(s, { kind: 'play', player: p, combo, outOfTurn: !onTurn });

  if (combo.cards.includes(MAHJONG)) {
    s.wish = wish;
    emit(s, { kind: 'wish', player: p, rank: wish });
  }
  if (s.wish !== null && containsRank(combo.cards, s.wish)) {
    emit(s, { kind: 'wishFulfilled', player: p, rank: s.wish });
    s.wish = null;
  }

  markOut(s, p);
  if (shouldRoundEnd(s)) return resolveTrick(s);
  s.turn = nextActive(s, p);
}

function doPass(s: GameState, p: Seat) {
  if (s.phase !== 'playing' || p !== s.turn) throw new IllegalAction('Not your turn');
  if (!s.trick.length) throw new IllegalAction('Cannot pass when leading');
  if (s.wish !== null && legalPlays(s.hands[p], topCombo(s), s.wish).mustFulfill) {
    throw new IllegalAction(`You must fulfil the wish (${s.wish})`);
  }
  s.passCount += 1;
  emit(s, { kind: 'pass', player: p });
  const activeCount = [0, 1, 2, 3].filter((q) => isActive(s, q)).length;
  const needed = activeCount - (isActive(s, s.lastPlayer!) ? 1 : 0);
  if (s.passCount >= needed) resolveTrick(s);
  else s.turn = nextActive(s, p);
}

function resolveTrick(s: GameState) {
  const winner = s.lastPlayer!;
  const top = topCombo(s)!;
  const cards = s.trick.flatMap((t) => t.combo.cards);
  s.trick = [];
  s.lastPlayer = null;
  s.passCount = 0;
  if (top.type === 'single' && top.cards[0] === DRAGON) {
    s.phase = 'dragonGive';
    s.dragonPending = { winner, cards };
    return;
  }
  s.tricksWon[winner].push(...cards);
  emit(s, { kind: 'trick', winner, to: winner, cards, points: cardPoints(cards) });
  afterTrick(s, winner);
}

function afterTrick(s: GameState, winner: Seat) {
  if (shouldRoundEnd(s)) return endRound(s);
  s.turn = isActive(s, winner) ? winner : nextActive(s, winner);
}

function doGiveDragon(s: GameState, p: Seat, to: Seat) {
  if (s.phase !== 'dragonGive' || !s.dragonPending || s.dragonPending.winner !== p) {
    throw new IllegalAction('No Dragon trick to give');
  }
  if (team(to) === team(p)) throw new IllegalAction('Dragon trick must go to an opponent');
  const { cards } = s.dragonPending;
  s.tricksWon[to].push(...cards);
  s.dragonPending = null;
  s.phase = 'playing';
  emit(s, { kind: 'trick', winner: p, to, cards, points: cardPoints(cards) });
  afterTrick(s, p);
}

function endRound(s: GameState) {
  const fin = [...s.finished];
  const cardPts: [number, number] = [0, 0];
  let doubleVictory: number | null = null;
  if (fin.length >= 2 && team(fin[0]) === team(fin[1])) {
    doubleVictory = team(fin[0]);
    cardPts[doubleVictory] = 200;
  } else {
    const last = [0, 1, 2, 3].find((p) => !fin.includes(p))!;
    cardPts[1 - team(last)] += cardPoints(s.hands[last]);
    s.tricksWon[fin[0]].push(...s.tricksWon[last]);
    s.tricksWon[last] = [];
    for (let p = 0; p < 4; p++) cardPts[team(p)] += cardPoints(s.tricksWon[p]);
    fin.push(last);
  }
  const tichuPts: [number, number] = [0, 0];
  for (let p = 0; p < 4; p++) {
    const c = s.calls[p];
    if (c === 'none') continue;
    const v = c === 'grand' ? 200 : 100;
    tichuPts[team(p)] += fin[0] === p ? v : -v;
  }
  const total: [number, number] = [cardPts[0] + tichuPts[0], cardPts[1] + tichuPts[1]];
  s.scores = [s.scores[0] + total[0], s.scores[1] + total[1]];
  const result: RoundResult = {
    round: s.round,
    cardPoints: cardPts,
    tichuPoints: tichuPts,
    total,
    doubleVictory,
    finished: fin,
    calls: [...s.calls],
  };
  s.history.push(result);
  emit(s, { kind: 'roundEnd', result });
  const [a, b] = s.scores;
  if (Math.max(a, b) >= s.targetScore && a !== b) {
    s.phase = 'gameOver';
    emit(s, { kind: 'gameOver', winner: a > b ? 0 : 1 });
  } else {
    s.phase = 'roundOver';
  }
}
