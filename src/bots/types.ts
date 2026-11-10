import type { Action } from '../engine/game';
import type { PlayerView } from '../engine/view';

export type BotLevel = 'easy' | 'normal' | 'hard';

export const BOT_LEVELS: { id: BotLevel; name: string; blurb: string }[] = [
  { id: 'easy', name: 'Novice', blurb: 'Plays its lowest card. Never calls Tichu.' },
  { id: 'normal', name: 'Adept', blurb: 'Plans its hand, supports its partner, calls Tichu.' },
  { id: 'hard', name: 'Master', blurb: 'Adds card counting, smarter bombs and wishes.' },
];

/** A decision plus a human-readable explanation (used by the coach / learning mode). */
export interface Decision {
  action: Action;
  reason: string;
}

export interface Bot {
  readonly level: BotLevel;
  grandTichu(v: PlayerView): Decision;
  /** Called while the bot may still call Tichu. Return a decision to call, or null. */
  tichu(v: PlayerView): Decision | null;
  passCards(v: PlayerView): Decision;
  /** Bot is on turn. */
  play(v: PlayerView): Decision;
  /** Bot is not on turn and could bomb. Return null to hold. */
  bomb(v: PlayerView): Decision | null;
  giveDragon(v: PlayerView): Decision;
}
