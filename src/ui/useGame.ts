import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Action, GameState, IllegalAction, applyAction, newGame } from '../engine/game';
import { viewFor } from '../engine/view';
import { Bot, BotLevel, Decision, HeuristicBot, botDelay, makeBot, nextBotDecision } from '../bots';

export interface GameConfig {
  /** Bot levels for seats 1 (East), 2 (North, partner), 3 (West). */
  levels: [BotLevel, BotLevel, BotLevel];
  targetScore: number;
  speed: number; // 1 = normal, 0.5 = fast, 2 = slow
}

export interface Thought {
  /** Event id this thought precedes, for interleaving with the game log. */
  beforeEvent: number;
  seat: number;
  text: string;
}

const coach = new HeuristicBot('hard');

/** `?seed=123` in the URL gives a reproducible deal (handy for bug reports). */
function urlSeed(): number | undefined {
  const v = new URLSearchParams(window.location.search).get('seed');
  return v !== null && /^-?\d+$/.test(v) ? Number(v) : undefined;
}

export function useGame(cfg: GameConfig) {
  const bots = useMemo<(Bot | null)[]>(() => [null, ...cfg.levels.map(makeBot)], [cfg.levels]);
  const [state, setState] = useState<GameState>(() => newGame({ targetScore: cfg.targetScore, seed: urlSeed() }));
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback((a: Action): boolean => {
    try {
      const next = applyAction(stateRef.current, a);
      stateRef.current = next;
      setState(next);
      setError(null);
      return true;
    } catch (e) {
      if (e instanceof IllegalAction) {
        setError(e.message);
        return false;
      }
      throw e;
    }
  }, []);

  // Drive the bots.
  useEffect(() => {
    if (state.phase === 'roundOver' || state.phase === 'gameOver') return;
    const delay = botDelay(state);
    const timer = setTimeout(() => {
      const s = stateRef.current;
      const d = nextBotDecision(s, bots);
      if (!d) return;
      setThoughts((t) => [...t.slice(-200), { beforeEvent: s.nextEventId, seat: d.seat, text: d.reason }]);
      dispatch(d.action);
    }, delay * cfg.speed);
    return () => clearTimeout(timer);
  }, [state, bots, dispatch, cfg.speed]);

  const restart = useCallback(() => {
    const s = newGame({ targetScore: cfg.targetScore });
    stateRef.current = s;
    setState(s);
    setThoughts([]);
  }, [cfg.targetScore]);

  const hint = useCallback(() => coachHint(stateRef.current), []);

  return { state, dispatch, thoughts, error, setError, restart, hint } satisfies GameController;
}

/** What the UI needs from a game, whether it runs locally or on a server. */
export interface GameController {
  state: GameState;
  dispatch: (a: Action) => boolean;
  thoughts: Thought[];
  error: string | null;
  setError: (e: string | null) => void;
  restart: () => void;
  hint: () => Decision | null;
}

/** Ask the Master bot what it would do in seat 0 (works on masked online states too). */
export function coachHint(s: GameState): Decision | null {
  const v = viewFor(s, 0);
  switch (s.phase) {
    case 'grandTichu':
      return s.grandDecided[0] ? null : coach.grandTichu(v);
    case 'passing':
      return s.passChoices[0] ? coach.tichu(v) : coach.passCards(v);
    case 'playing':
      if (s.turn !== 0) return coach.bomb(v);
      return coach.tichu(v) ?? coach.play(v);
    case 'dragonGive':
      return s.dragonPending?.winner === 0 ? coach.giveDragon(v) : null;
    default:
      return null;
  }
}
