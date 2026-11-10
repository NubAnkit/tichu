import { Action, GameState, applyAction, canCallTichu, newGame, pendingActors } from '../engine/game';
import { viewFor, viewOptions } from '../engine/view';
import type { Bot, Decision } from './types';

/**
 * Pick the next action for a table of bots (used by the headless simulator,
 * and by the UI for bot seats). Returns null if a non-bot seat must act.
 */
export function nextBotDecision(s: GameState, bots: (Bot | null)[]): (Decision & { seat: number }) | null {
  if (s.phase === 'playing') {
    // Out-of-turn bombs first: any bot not on turn may interrupt.
    if (s.trick.length) {
      for (let k = 1; k <= 3; k++) {
        const p = (s.turn + k) % 4;
        const bot = bots[p];
        if (!bot) continue;
        const v = viewFor(s, p);
        if (!viewOptions(v).plays.length) continue;
        const d = bot.bomb(v);
        if (d) return { ...d, seat: p };
      }
    }
    const p = s.turn;
    const bot = bots[p];
    if (!bot) return null;
    if (canCallTichu(s, p)) {
      const t = bot.tichu(viewFor(s, p));
      if (t) return { ...t, seat: p };
    }
    return { ...bot.play(viewFor(s, p)), seat: p };
  }
  for (const p of pendingActors(s)) {
    const bot = bots[p];
    if (!bot) continue;
    const v = viewFor(s, p);
    if (s.phase === 'grandTichu') return { ...bot.grandTichu(v), seat: p };
    if (s.phase === 'passing') {
      if (canCallTichu(s, p)) {
        const t = bot.tichu(v);
        if (t) return { ...t, seat: p };
      }
      return { ...bot.passCards(v), seat: p };
    }
    if (s.phase === 'dragonGive') return { ...bot.giveDragon(v), seat: p };
  }
  return null;
}

export interface SimResult {
  state: GameState;
  actions: number;
}

/** Play a whole game with 4 bots. */
export function simulateGame(bots: Bot[], seed: number, targetScore = 1000, onAction?: (a: Action, s: GameState) => void): SimResult {
  let s = newGame({ seed, targetScore });
  let actions = 0;
  while (s.phase !== 'gameOver') {
    if (s.phase === 'roundOver') {
      s = applyAction(s, { type: 'nextRound' });
      continue;
    }
    const d = nextBotDecision(s, bots);
    if (!d) throw new Error(`No bot decision in phase ${s.phase}`);
    s = applyAction(s, d.action);
    onAction?.(d.action, s);
    if (++actions > 200000) throw new Error('Game did not terminate');
  }
  return { state: s, actions };
}
