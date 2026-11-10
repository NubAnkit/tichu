import { cardPoints, rankLabel } from '../engine/cards';
import { describeCombo } from '../engine/combos';
import type { GameEvent } from '../engine/game';

export const SEAT_LABEL = ['You', 'East', 'North', 'West'];
export const SEAT_DIR = ['south', 'east', 'north', 'west'] as const;
let seatNames: string[] = SEAT_LABEL;
/** Override seat names (relative seats: 0 = you, 1 = right, 2 = partner, 3 = left). */
export function setSeatNames(names: string[] | null) {
  seatNames = names ? ['You', ...names.slice(1)] : SEAT_LABEL;
}
export const seatLabel = (p: number) => seatNames[p];
export const TEAM_LABEL = ['Your team', 'Opponents'];

export function describeEvent(e: GameEvent): string | null {
  switch (e.kind) {
    case 'deal':
      return `— Round ${e.round} —`;
    case 'call':
      return `${seatLabel(e.player)} called ${e.call === 'grand' ? 'GRAND TICHU' : 'TICHU'}!`;
    case 'exchange':
      return 'Cards exchanged.';
    case 'play':
      return `${seatLabel(e.player)}${e.outOfTurn ? ' (out of turn!)' : ''}: ${describeCombo(e.combo)}`;
    case 'pass':
      return `${seatLabel(e.player)} passed.`;
    case 'wish':
      return e.rank ? `${seatLabel(e.player)} wishes for a ${rankLabel(e.rank)}.` : `${seatLabel(e.player)} made no wish.`;
    case 'wishFulfilled':
      return `Wish for ${rankLabel(e.rank)} fulfilled by ${seatLabel(e.player)}.`;
    case 'dog':
      return `The Dog hands the lead to ${seatLabel(e.to)}.`;
    case 'trick':
      return e.to === e.winner
        ? `${seatLabel(e.winner)} won the trick (${cardPoints(e.cards)} pts).`
        : `${seatLabel(e.winner)} gave the Dragon trick (${e.points} pts) to ${seatLabel(e.to)}.`;
    case 'out':
      return `${seatLabel(e.player)} went out ${['', '1st', '2nd', '3rd', '4th'][e.place]}!`;
    case 'roundEnd': {
      const r = e.result;
      return `Round ${r.round}: you ${r.total[0] >= 0 ? '+' : ''}${r.total[0]}, opponents ${r.total[1] >= 0 ? '+' : ''}${r.total[1]}.`;
    }
    case 'gameOver':
      return e.winner === 0 ? 'Your team wins the game!' : 'The opponents win the game.';
  }
}
