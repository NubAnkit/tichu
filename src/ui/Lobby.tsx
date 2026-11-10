import { useState } from 'react';
import { BOT_LEVELS, BotLevel } from '../bots/types';
import type { SeatInfo } from '../net/protocol';
import type { Online } from './online';
import { shareLink } from './online';

const POSITIONS = ['South', 'East', 'North', 'West'];
const TEAM = ['Team A', 'Team B', 'Team A', 'Team B'];

interface Props {
  online: Online;
  /** Shown as an overlay during a game (e.g. to swap a dropped player for a bot). */
  overlay?: boolean;
  onClose?: () => void;
}

export function Lobby({ online, overlay, onClose }: Props) {
  const { lobby, you, isHost, send, status, error, setError } = online;
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  if (!lobby || !you) {
    return (
      <div className="lobby-wait">{status === 'reconnecting' ? 'Reconnecting…' : 'Connecting to the game server…'}</div>
    );
  }
  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? lobby.code : shareLink(lobby.code));
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable — the code is on screen */
    }
  };
  const humans = lobby.seats.filter((s) => s.kind === 'human').length;

  const seatCard = (seat: number) => {
    const s: SeatInfo = lobby.seats[seat];
    const mine = you.seat === seat;
    const partner = you.seat !== null && (you.seat + 2) % 4 === seat;
    const canSit = !mine && (s.kind !== 'human' || (!s.connected && !lobby.started));
    const hostCanSet = isHost && !(s.kind === 'human' && s.connected && !mine) && !mine;
    return (
      <div key={seat} className={`lobby-seat pos-${POSITIONS[seat].toLowerCase()} ${mine ? 'mine' : ''} kind-${s.kind}`}>
        <div className="lobby-seat-pos">
          {POSITIONS[seat]} <small>{TEAM[seat]}{partner ? ' · your partner' : ''}</small>
        </div>
        <div className="lobby-seat-who">
          {s.kind === 'human' && (
            <>
              {s.name}
              {mine && ' (you)'}
              {s.memberId === lobby.hostId && <span className="host-chip">host</span>}
              {!s.connected && <span className="offline-chip">offline</span>}
            </>
          )}
          {s.kind === 'bot' && <><span className="bot-chip">BOT</span> {BOT_LEVELS.find((l) => l.id === s.level)?.name}</>}
          {s.kind === 'empty' && <span className="muted">Open seat</span>}
        </div>
        <div className="lobby-seat-actions">
          {canSit && (
            <button className="btn tiny primary" onClick={() => send({ t: 'sit', seat })}>
              Sit here
            </button>
          )}
          {mine && !lobby.started && (
            <button className="btn tiny ghost" onClick={() => send({ t: 'stand' })}>
              Stand up
            </button>
          )}
          {hostCanSet && (
            <select
              className="seat-select"
              value={s.kind === 'bot' ? s.level : ''}
              onChange={(e) => send({ t: 'setSeat', seat, level: (e.target.value || null) as BotLevel | null })}
            >
              {!lobby.started && <option value="">{s.kind === 'human' ? 'Remove player' : 'Open seat'}</option>}
              {lobby.started && s.kind === 'human' && <option value="">Replace with…</option>}
              {BOT_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} bot
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={overlay ? 'modal-backdrop' : 'lobby-page'}>
      <div className={`lobby ${overlay ? 'modal' : 'menu-section'}`}>
        <div className="lobby-head">
          <div>
            <div className="lobby-label">Lobby code</div>
            <button className="lobby-code" onClick={() => copy('code')} title="Copy code">
              {lobby.code}
            </button>
          </div>
          <div className="lobby-share">
            <button className="btn small" onClick={() => copy('link')}>
              {copied === 'link' ? 'Link copied!' : 'Copy invite link'}
            </button>
            {copied === 'code' && <span className="muted">Code copied!</span>}
            <span className="muted small">Friends can enter the code under “Play with friends”, or open the link.</span>
          </div>
        </div>

        <div className="lobby-table">
          {seatCard(2)}
          {seatCard(3)}
          <div className="lobby-felt">
            {lobby.started ? 'Game in progress' : `${humans} player${humans === 1 ? '' : 's'} seated`}
            <small>Partners sit opposite each other</small>
          </div>
          {seatCard(1)}
          {seatCard(0)}
        </div>

        {you.seat === null && <p className="muted center">You're watching. Pick an open or bot seat to play.</p>}
        {lobby.spectators.length > 0 && <p className="muted center small">Watching: {lobby.spectators.join(', ')}</p>}
        {error && (
          <div className="error" onClick={() => setError(null)}>
            {error}
          </div>
        )}

        <div className="lobby-foot">
          {!lobby.started && (
            <label className="field inline">
              <span>Play to</span>
              <select
                disabled={!isHost}
                value={lobby.targetScore}
                onChange={(e) => send({ t: 'setTarget', targetScore: Number(e.target.value) })}
              >
                <option value={1000}>1000</option>
                <option value={500}>500</option>
                <option value={200}>200</option>
              </select>
            </label>
          )}
          {!lobby.started &&
            (isHost ? (
              <button className="btn primary big" onClick={() => send({ t: 'start' })}>
                Start game
              </button>
            ) : (
              <span className="muted">Waiting for the host to start…</span>
            ))}
          {!lobby.started && isHost && lobby.seats.some((s) => s.kind === 'empty') && (
            <span className="muted small">Open seats will be filled with Adept bots.</span>
          )}
          {overlay && (
            <button className="btn ghost" onClick={onClose}>
              Back to table
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
