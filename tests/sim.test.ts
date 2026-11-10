import { describe, expect, it } from 'vitest';
import { makeBot, simulateGame } from '../src/bots';
import type { BotLevel } from '../src/bots';

describe('full bot games', () => {
  const tables: BotLevel[][] = [
    ['easy', 'easy', 'easy', 'easy'],
    ['normal', 'hard', 'normal', 'hard'],
    ['hard', 'easy', 'hard', 'normal'],
  ];
  for (const levels of tables) {
    it(`completes games with ${levels.join('/')}`, () => {
      for (let seed = 1; seed <= 4; seed++) {
        const { state } = simulateGame(levels.map(makeBot), seed * 7919, 1000);
        expect(state.phase).toBe('gameOver');
        for (const r of state.history) {
          if (r.doubleVictory === null) expect(r.cardPoints[0] + r.cardPoints[1]).toBe(100);
          else expect(r.cardPoints[r.doubleVictory]).toBe(200);
        }
        const sum = state.history.reduce((a, r) => [a[0] + r.total[0], a[1] + r.total[1]], [0, 0]);
        expect(sum).toEqual(state.scores);
      }
    }, 60000);
  }
});
