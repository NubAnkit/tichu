import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../engine/game';
import { BOT_LEVELS } from '../bots/types';
import type { ClientMsg, LobbyInfo, ServerMsg } from '../net/protocol';
import { GameController, coachHint } from './useGame';
import type { SeatDisplay } from './GameScreen';

export type OnlineStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

const TOKENS_KEY = 'tichu.tokens';
function loadTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function saveToken(code: string, token: string) {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ ...loadTokens(), [code]: token }));
  } catch {
    /* ignore */
  }
}

const ACTIVE_KEY = 'tichu.activeLobby';
/** The lobby this browser was last in (so a page refresh drops you straight back in). */
export function activeLobby(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function setActiveLobby(code: string | null) {
  try {
    if (code) localStorage.setItem(ACTIVE_KEY, code);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

function wsUrl() {
  const env = (import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL;
  if (env) return env.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export function shareLink(code: string) {
  return `${location.origin}${location.pathname}?join=${code}`;
}

/** Connection to the game server for one lobby. */
export function useOnline() {
  const ws = useRef<WebSocket | null>(null);
  const session = useRef<{ code: string; name: string } | null>(null);
  const leaving = useRef(false);
  const [status, setStatus] = useState<OnlineStatus>('idle');
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [you, setYou] = useState<{ memberId: string; seat: number | null } | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((first: ClientMsg) => {
    ws.current?.close();
    leaving.current = false;
    const sock = new WebSocket(wsUrl());
    ws.current = sock;
    setStatus((s) => (s === 'reconnecting' ? s : 'connecting'));
    sock.onopen = () => {
      setStatus('open');
      sock.send(JSON.stringify(first));
    };
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data) as ServerMsg;
      switch (m.t) {
        case 'welcome':
          session.current = { code: m.code, name: session.current?.name ?? '' };
          saveToken(m.code, m.token);
          setActiveLobby(m.code);
          break;
        case 'lobby':
          setLobby(m.lobby);
          setYou(m.you);
          if (!m.lobby.started) setState(null);
          break;
        case 'state':
          setState(m.state);
          break;
        case 'error':
          // a second "next round" click from another player is harmless
          if (!/Round is not over/.test(m.message)) setError(m.message);
          if (/No lobby/.test(m.message)) {
            session.current = null;
            setActiveLobby(null);
            setStatus('idle');
          }
          break;
      }
    };
    sock.onclose = () => {
      if (ws.current !== sock) return;
      ws.current = null;
      const sess = session.current;
      if (leaving.current || !sess?.code) {
        setStatus('idle');
        return;
      }
      // dropped: try to rejoin with our token
      setStatus('reconnecting');
      setTimeout(() => {
        if (session.current === sess && !leaving.current) {
          open({ t: 'join', code: sess.code, name: sess.name, token: loadTokens()[sess.code] });
        }
      }, 1200);
    };
  }, []);

  const send = useCallback((m: ClientMsg) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m));
    else setError('Not connected — reconnecting…');
  }, []);

  const create = useCallback((name: string) => {
    session.current = { code: '', name };
    setError(null);
    open({ t: 'create', name });
  }, [open]);

  const join = useCallback((code: string, name: string) => {
    const c = code.toUpperCase().trim();
    session.current = { code: c, name };
    setError(null);
    open({ t: 'join', code: c, name, token: loadTokens()[c] });
  }, [open]);

  const leave = useCallback(() => {
    leaving.current = true;
    setActiveLobby(null);
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ t: 'leave' }));
    ws.current?.close();
    ws.current = null;
    session.current = null;
    setLobby(null);
    setYou(null);
    setState(null);
    setStatus('idle');
  }, []);

  useEffect(() => () => ws.current?.close(), []);

  const isHost = !!lobby && !!you && lobby.hostId === you.memberId;

  const controller = useMemo<GameController | null>(() => {
    if (!state) return null;
    return {
      state,
      dispatch: (action) => {
        send({ t: 'action', action });
        return true;
      },
      thoughts: [],
      error,
      setError,
      restart: () => send({ t: 'restart' }),
      hint: () => (you?.seat === null ? null : coachHint(state)),
    };
  }, [state, error, send, you]);

  /** Seat names/tags rotated so index 0 is this player. */
  const seats = useMemo<SeatDisplay[]>(() => {
    if (!lobby) return [];
    const mine = you?.seat ?? 0;
    return [0, 1, 2, 3].map((q) => {
      const s = lobby.seats[(q + mine) % 4];
      const role = q === 0 ? 'You' : q === 2 ? 'Partner' : 'Opponent';
      if (q === 0 && you?.seat !== null) return { name: 'You', tag: 'You' };
      if (s.kind === 'human') return { name: s.name, tag: `${role} · ${s.connected ? 'Human' : 'offline…'}` };
      if (s.kind === 'bot') {
        const lvl = BOT_LEVELS.find((l) => l.id === s.level)?.name ?? s.level;
        return { name: ['You', 'East', 'North', 'West'][q], tag: `${role} · ${lvl} bot` };
      }
      return { name: 'Empty', tag: role };
    });
  }, [lobby, you]);

  return { status, lobby, you, isHost, state, error, setError, create, join, leave, send, controller, seats };
}

export type Online = ReturnType<typeof useOnline>;
