import type { BotLevel } from '../bots/types';
import type { Action, GameEvent, GameState, RoundResult } from '../engine/game';

/*
 * Wire protocol between browser and game server (JSON over WebSocket).
 *
 * The server is authoritative: it runs the engine and bots. Each client is sent a
 * *client state*: the real GameState rotated so that the receiving player is seat 0
 * (so the UI can always draw "you" at the bottom) and masked so other players'
 * cards are hidden (hidden cards are -1).
 */

export const HIDDEN = -1;

export type SeatInfo =
  | { kind: 'empty' }
  | { kind: 'bot'; level: BotLevel }
  | { kind: 'human'; memberId: string; name: string; connected: boolean };

export interface LobbyInfo {
  code: string;
  hostId: string;
  /** Absolute seats 0..3 (0 & 2 are one team, 1 & 3 the other). */
  seats: SeatInfo[];
  started: boolean;
  targetScore: number;
  /** Host setting: show the Card Tracker panel to players. */
  cardTracker: boolean;
  spectators: string[];
}

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string; token?: string }
  | { t: 'sit'; seat: number }
  | { t: 'stand' }
  | { t: 'setSeat'; seat: number; level: BotLevel | null }
  | { t: 'setTarget'; targetScore: number }
  | { t: 'setOptions'; cardTracker: boolean }
  | { t: 'start' }
  | { t: 'restart' }
  | { t: 'action'; action: Action }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'welcome'; code: string; memberId: string; token: string }
  | { t: 'lobby'; lobby: LobbyInfo; you: { memberId: string; seat: number | null } }
  | { t: 'state'; state: GameState; seat: number }
  | { t: 'error'; message: string };

export function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

// ---------------------------------------------------------------------------
// Rotation + masking
// ---------------------------------------------------------------------------

/** Rotate a seat-indexed array so that `seat` becomes index 0. */
function rot<T>(arr: T[], seat: number): T[] {
  return [0, 1, 2, 3].map((q) => arr[(q + seat) % 4]);
}
const relSeat = (p: number, seat: number) => (p - seat + 4) % 4;
const absSeat = (q: number, seat: number) => (q + seat) % 4;
/** Teams: rotating by an odd number of seats swaps team indices. */
const relTeam = (t: number, seat: number) => (seat % 2 === 1 ? 1 - t : t);
function rotTeams<T>(pair: [T, T], seat: number): [T, T] {
  return seat % 2 === 1 ? [pair[1], pair[0]] : [pair[0], pair[1]];
}

function rotResult(r: RoundResult, seat: number): RoundResult {
  return {
    ...r,
    cardPoints: rotTeams(r.cardPoints, seat),
    tichuPoints: rotTeams(r.tichuPoints, seat),
    total: rotTeams(r.total, seat),
    doubleVictory: r.doubleVictory === null ? null : relTeam(r.doubleVictory, seat),
    finished: r.finished.map((p) => relSeat(p, seat)),
    calls: rot(r.calls, seat),
  };
}

function rotEvent(e: GameEvent, seat: number): GameEvent {
  const r = (p: number) => relSeat(p, seat);
  switch (e.kind) {
    case 'call':
    case 'pass':
    case 'out':
    case 'wish':
    case 'wishFulfilled':
      return { ...e, player: r(e.player) };
    case 'play':
      return { ...e, player: r(e.player) };
    case 'dog':
      return { ...e, player: r(e.player), to: r(e.to) };
    case 'trick':
      return { ...e, winner: r(e.winner), to: r(e.to) };
    case 'roundEnd':
      return { ...e, result: rotResult(e.result, seat) };
    case 'gameOver':
      return { ...e, winner: relTeam(e.winner, seat) };
    default:
      return e;
  }
}

/**
 * What the player at absolute `seat` may see, rotated so they are seat 0.
 * `spectator` hides every hand.
 */
export function clientState(s: GameState, seat: number, spectator = false): GameState {
  const hide = (cards: number[]) => cards.map(() => HIDDEN);
  const hands = s.hands.map((h, p) => (p === seat && !spectator ? [...h] : hide(h)));
  const passChoices = s.passChoices.map((pc, p) =>
    pc === null ? null : p === seat && !spectator ? pc : ([HIDDEN, HIDDEN, HIDDEN] as [number, number, number]),
  );
  const received = s.received.map((r, p) => (p === seat && !spectator ? r : null));
  return {
    ...s,
    rng: 0,
    hands: rot(hands, seat),
    undealt: [[], [], [], []],
    calls: rot(s.calls, seat),
    grandDecided: rot(s.grandDecided, seat),
    passChoices: rot(passChoices, seat),
    received: rot(received, seat),
    hasPlayed: rot(s.hasPlayed, seat),
    trick: s.trick.map((t) => ({ ...t, player: relSeat(t.player, seat) })),
    lastPlayer: s.lastPlayer === null ? null : relSeat(s.lastPlayer, seat),
    turn: relSeat(s.turn, seat),
    finished: s.finished.map((p) => relSeat(p, seat)),
    tricksWon: rot(s.tricksWon, seat),
    dragonPending: s.dragonPending ? { ...s.dragonPending, winner: relSeat(s.dragonPending.winner, seat) } : null,
    scores: rotTeams(s.scores, seat),
    history: s.history.map((r) => rotResult(r, seat)),
    events: s.events.map((e) => rotEvent(e, seat)),
  };
}

/** Translate an action from a client's rotated frame back to absolute seats. */
export function absoluteAction(a: Action, seat: number): Action {
  switch (a.type) {
    case 'nextRound':
      return a;
    case 'giveDragon':
      return { ...a, player: seat, to: absSeat(a.to, seat) };
    default:
      return { ...a, player: seat } as Action;
  }
}

/** Seat-indexed values rotated into a client's frame (e.g. names). */
export const rotateForSeat = rot;
