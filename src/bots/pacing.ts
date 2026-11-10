import type { GameState } from '../engine/game';

/** How long a bot "thinks" before acting, in ms (before any speed multiplier). */
export function botDelay(state: GameState): number {
  const last = state.events[state.events.length - 1];
  if (state.phase === 'grandTichu' || state.phase === 'passing') return 250;
  if (last?.kind === 'trick' || last?.kind === 'dog') return 1300;
  if (last?.kind === 'pass') return 550;
  if (last?.kind === 'play') return 900;
  if (last?.kind === 'exchange') return 1400;
  return 650;
}
