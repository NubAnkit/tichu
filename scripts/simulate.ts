/**
 * Headless bot-vs-bot simulator.
 *   npm run sim -- [games=40] [teamA=hard] [teamB=normal]
 * Prints win rate and Tichu call statistics. This is the seed of a future
 * training / evaluation harness.
 */
import { makeBot, simulateGame } from '../src/bots';
import type { BotLevel } from '../src/bots';

const [gamesArg, aArg, bArg] = process.argv.slice(2);
const games = Number(gamesArg ?? 40);
const A = (aArg ?? 'hard') as BotLevel;
const B = (bArg ?? 'normal') as BotLevel;

let winsA = 0;
let rounds = 0;
const calls = { tichu: [0, 0], grand: [0, 0] }; // [made, succeeded]
let doubles = [0, 0];
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  // alternate seats so neither team gets a positional edge
  const flip = g % 2 === 1;
  const levels = flip ? [B, A, B, A] : [A, B, A, B];
  const { state } = simulateGame(levels.map(makeBot), 1000 + g);
  const teamA = flip ? 1 : 0;
  if (state.scores[teamA] > state.scores[1 - teamA]) winsA++;
  for (const r of state.history) {
    rounds++;
    if (r.doubleVictory !== null) doubles[r.doubleVictory === teamA ? 0 : 1]++;
    r.calls.forEach((c, p) => {
      if (c === 'none') return;
      calls[c][0]++;
      if (r.finished[0] === p) calls[c][1]++;
    });
  }
}
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) + '%' : '-');
console.log(`${A} vs ${B}: ${games} games, ${rounds} rounds, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  ${A} win rate: ${pct(winsA, games)}`);
console.log(`  Tichu calls: ${calls.tichu[0]} (${pct(calls.tichu[1], calls.tichu[0])} success), per round ${(calls.tichu[0] / rounds).toFixed(2)}`);
console.log(`  Grand calls: ${calls.grand[0]} (${pct(calls.grand[1], calls.grand[0])} success)`);
console.log(`  Double victories: ${A} ${doubles[0]}, ${B} ${doubles[1]}`);
