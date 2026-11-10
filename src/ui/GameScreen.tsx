import { useEffect, useMemo, useRef, useState } from 'react';
import { CARDS, CardId, DRAGON, MAHJONG, PHOENIX, DOG, rankLabel } from '../engine/cards';
import { COMBO_NAMES, Combo, beats, comboKey, describeCombo, isBomb, parseCombo } from '../engine/combos';
import { GameEvent, canCallTichu, isActive, playOptions, team, topCombo } from '../engine/game';
import type { Decision } from '../bots';
import { Card, RankText } from './components/Card';
import { SwirlBackground } from './components/Backgrounds';
import type { ReactNode } from 'react';
import type { GameState } from '../engine/game';
import type { GameController } from './useGame';
import { SEAT_DIR, describeEvent, seatLabel, setSeatNames } from './text';

export interface SeatDisplay {
  name: string;
  /** e.g. "Opponent · Master" or "Partner · friend" */
  tag: string;
}

interface Props {
  game: GameController;
  /** Relative seats 0..3 (0 = you). */
  seats: SeatDisplay[];
  onMenu: () => void;
  menuLabel?: string;
  /** Online games hide bot reasoning (it would leak hidden cards). */
  online?: boolean;
  canRestart?: boolean;
  topbarExtra?: ReactNode;
}

interface Banner {
  key: number;
  title: string;
  sub?: string;
  tone: 'call' | 'bomb' | 'dragon' | 'out' | 'info';
}

const PASS_TARGETS = [
  { label: 'West', role: 'opponent', seat: 3 },
  { label: 'North', role: 'partner', seat: 2 },
  { label: 'East', role: 'opponent', seat: 1 },
];

export function GameScreen({ game, seats, onMenu, menuLabel = 'Menu', online = false, canRestart = true, topbarExtra }: Props) {
  const { state, dispatch, thoughts, error, setError, restart, hint } = game;
  setSeatNames(seats.map((s) => s.name));
  useEffect(() => () => setSeatNames(null), []);
  const [selected, setSelected] = useState<CardId[]>([]);
  const [passSlots, setPassSlots] = useState<(CardId | null)[]>([null, null, null]);
  const [wishFor, setWishFor] = useState<CardId[] | null>(null);
  const [advice, setAdvice] = useState<Decision | null>(null);
  const [hinted, setHinted] = useState<CardId[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'log' | 'tracker' | 'scores'>('log');
  // hover (or tap) the trick to see every play in it
  const [trickHover, setTrickHover] = useState(false);
  const [trickPinned, setTrickPinned] = useState(false);
  const [showThoughts, setShowThoughts] = useState(true);
  const seenEvent = useRef(0);

  const me = 0;
  const hand = state.hands[me];
  const phase = state.phase;
  const top = topCombo(state);
  const opts = useMemo(() => playOptions(state, me), [state]);
  const legalKeys = useMemo(() => new Set(opts.plays.map((c) => comboKey(c.cards))), [opts]);

  // reset UI selections when the situation changes
  useEffect(() => {
    setSelected((sel) => sel.filter((c) => hand.includes(c)));
    setHinted([]);
  }, [state.turn, state.trick.length, phase, hand]);
  useEffect(() => {
    if (phase === 'passing' && !state.passChoices[me]) return;
    setPassSlots([null, null, null]);
  }, [phase, state.round, state.passChoices]);
  useEffect(() => setAdvice(null), [state.nextEventId]);
  useEffect(() => {
    if (!state.trick.length) {
      setTrickPinned(false);
      setTrickHover(false);
    }
  }, [state.trick.length]);

  // banners for big moments
  useEffect(() => {
    const fresh = state.events.filter((e) => e.id > seenEvent.current);
    if (!fresh.length) return;
    seenEvent.current = fresh[fresh.length - 1].id;
    const b = pickBanner(fresh);
    if (b) {
      setBanner(b);
      const t = setTimeout(() => setBanner((cur) => (cur?.key === b.key ? null : cur)), 1700);
      return () => clearTimeout(t);
    }
  }, [state.events]);

  // ---- selection / validation
  const selCombo: Combo | null = selected.length ? parseCombo(selected, top) : null;
  const selLegal = selCombo ? legalKeys.has(comboKey(selected)) : false;
  let selStatus = '';
  if (phase === 'playing' && selected.length) {
    if (!selCombo) selStatus = 'Not a valid combination';
    else if (selLegal) selStatus = describeCombo(selCombo) + ' ✓';
    else if (state.turn !== me && !isBomb(selCombo)) selStatus = `${describeCombo(selCombo)} — wait for your turn`;
    else if (top && !beats(selCombo, top)) selStatus = `${describeCombo(selCombo)} doesn't beat ${describeCombo(top)}`;
    else if (opts.mustFulfill) selStatus = `You must fulfil the wish for ${rankLabel(state.wish!)}`;
    else selStatus = `${describeCombo(selCombo)} can't be played now`;
  }

  const toggle = (id: CardId) => {
    setHinted([]);
    if (phase === 'passing' && !state.passChoices[me]) {
      setPassSlots((slots) => {
        const at = slots.indexOf(id);
        if (at >= 0) return slots.map((c, i) => (i === at ? null : c));
        const empty = slots.indexOf(null);
        if (empty < 0) return slots;
        return slots.map((c, i) => (i === empty ? id : c));
      });
      return;
    }
    if (phase !== 'playing' || !isActive(state, me)) return;
    setSelected((sel) => (sel.includes(id) ? sel.filter((c) => c !== id) : [...sel, id]));
  };

  const play = (cards: CardId[], wish: number | null = null) => {
    if (cards.includes(MAHJONG) && wish === null && wishFor === null) {
      setWishFor(cards);
      return;
    }
    if (dispatch({ type: 'play', player: me, cards, wish })) setSelected([]);
    setWishFor(null);
  };

  const askHint = () => {
    const d = hint();
    setAdvice(d ?? { action: { type: 'nextRound' }, reason: 'Nothing to decide right now.' });
    if (!d) return;
    const a = d.action;
    if (a.type === 'play') {
      setHinted(a.cards);
      setSelected(a.cards);
    } else if (a.type === 'passCards') {
      setPassSlots([...a.cards]);
    }
  };

  // ---- derived display data
  const lastActs = useMemo(() => recentActs(state.events), [state.events]);
  const lastTrickEvent = useMemo(() => {
    for (let i = state.events.length - 1; i >= 0; i--) {
      const e = state.events[i];
      if (e.kind === 'play') return null;
      if (e.kind === 'trick') return e;
      if (e.kind === 'deal') return null;
    }
    return null;
  }, [state.events]);

  const receivedTags = new Map<CardId, string>();
  const rec = state.received[me];
  if (rec && !state.hasPlayed[me] && phase === 'playing') {
    rec.forEach((c, i) => receivedTags.set(c, ['from W', 'from N', 'from E'][i]));
  }

  const modalOpen =
    wishFor !== null ||
    phase === 'roundOver' ||
    phase === 'gameOver' ||
    (phase === 'dragonGive' && state.dragonPending?.winner === me);

  const handToShow = phase === 'passing' && !state.passChoices[me] ? hand.filter((c) => !passSlots.includes(c)) : hand;

  return (
    <div className="game theme-arcade">
      <SwirlBackground />

      <header className="topbar">
        <div className="brand">TICHU</div>
        <div className="round-chip">Round {state.round}</div>
        <div className="score-pills">
          <span className="pill us">Us {state.scores[0]}</span>
          <span className="pill them">Them {state.scores[1]}</span>
          <span className="pill target">to {state.targetScore}</span>
        </div>
        <div className="topbar-actions">
          {topbarExtra}
          <button className="btn small ghost" onClick={onMenu}>
            {menuLabel}
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="board">
          {[2, 3, 1].map((p) => (
            <SeatView
              key={p}
              seat={p}
              state={state}
              lastAct={lastActs.get(p)}
              tag={seats[p].tag}
            />
          ))}

          <div className="center">
            {state.wish !== null && (
              <div className="wish-chip">
                Wish: <b className="inline-rank"><RankText label={rankLabel(state.wish)} /></b>
              </div>
            )}
            <div className="trick">
              {state.trick.slice(-4).map((t, i, arr) => {
                const depth = arr.length - 1 - i;
                return (
                  <div
                    key={`${state.round}-${comboKey(t.combo.cards)}`}
                    className={`trick-play from-${SEAT_DIR[t.player]} depth-${depth}`}
                    style={{ zIndex: 10 - depth }}
                    onMouseEnter={() => setTrickHover(true)}
                    onMouseLeave={() => setTrickHover(false)}
                    onClick={() => setTrickPinned((v) => !v)}
                    title="Hover or tap to see every play in this trick"
                  >
                    <div className="trick-cards">
                      {t.combo.cards.map((c) => (
                        <Card key={c} id={c} size="md" />
                      ))}
                    </div>
                    {depth === 0 && (
                      <div className="trick-label">
                        {seatLabel(t.player)} · {describeCombo(t.combo)}
                        {t.combo.cards[0] === PHOENIX && t.combo.type === 'single' && ` (${t.combo.rank})`}
                        {state.trick.length > 1 && <span className="trick-count"> · {state.trick.length} plays</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              {!state.trick.length && lastTrickEvent && (
                <div key={lastTrickEvent.id} className={`trick-collect to-${SEAT_DIR[lastTrickEvent.to]}`}>
                  <div className="trick-cards">
                    {lastTrickEvent.cards.slice(-6).map((c) => (
                      <Card key={c} id={c} size="md" />
                    ))}
                  </div>
                  <div className="trick-label">
                    {seatLabel(lastTrickEvent.to)} take{lastTrickEvent.to === 0 ? '' : 's'} the trick · {lastTrickEvent.points} pts
                  </div>
                </div>
              )}
              {!state.trick.length && !lastTrickEvent && phase === 'playing' && (
                <div className="trick-empty">{state.turn === me ? 'Your lead' : `${seatLabel(state.turn)} to lead`}</div>
              )}
              {(trickHover || trickPinned) && state.trick.length > 0 && (
                <TrickHistory plays={state.trick} pinned={trickPinned} onClose={() => setTrickPinned(false)} />
              )}
            </div>
          </div>

          {/* ---- your area ---- */}
          <div className={`me-area ${state.turn === me && phase === 'playing' ? 'my-turn' : ''}`}>
            <div className="me-info">
              <span className="seat-name">You</span>
              <CallBadge call={state.calls[me]} />
              {state.finished.includes(me) && <span className="out-badge">Out #{state.finished.indexOf(me) + 1}</span>}
              {lastActs.get(me) === 'pass' && <span className="pass-bubble inline">Pass</span>}
            </div>

            <ActionBar
              state={state}
              opts={opts}
              selected={selected}
              selLegal={selLegal}
              selCombo={selCombo}
              selStatus={selStatus}
              passSlots={passSlots}
              setPassSlots={setPassSlots}
              onPlay={() => play(selected)}
              onPass={() => dispatch({ type: 'pass', player: me })}
              onTichu={() => dispatch({ type: 'tichu', player: me })}
              onGrand={(call) => dispatch({ type: 'grandTichu', player: me, call })}
              onConfirmPass={() => {
                if (passSlots.every((c) => c !== null)) {
                  dispatch({ type: 'passCards', player: me, cards: passSlots as [CardId, CardId, CardId] });
                }
              }}
              onClear={() => setSelected([])}
              onHint={askHint}
            />

            {advice && (
              <div className="advice">
                <span className="advice-tag">Coach</span> {advice.reason}
                <button className="btn tiny ghost" onClick={() => setAdvice(null)}>
                  ✕
                </button>
              </div>
            )}
            {error && (
              <div className="error" onClick={() => setError(null)}>
                {error}
              </div>
            )}

            <div className="hand">
              {handToShow.map((c, i) => (
                <Card
                  key={c}
                  id={c}
                  size="lg"
                  selected={selected.includes(c)}
                  hinted={hinted.includes(c)}
                  tag={receivedTags.get(c)}
                  onClick={() => toggle(c)}
                  style={{ ['--i' as string]: i, ['--n' as string]: handToShow.length }}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="side">
          <div className="tabs">
            {(['log', 'tracker', 'scores'] as const).map((t) => (
              <button key={t} className={`tab ${panel === t ? 'active' : ''}`} onClick={() => setPanel(t)}>
                {t === 'log' ? 'Log' : t === 'tracker' ? 'Card Tracker' : 'Scores'}
              </button>
            ))}
          </div>
          {panel === 'log' && (
            <LogPanel events={state.events} thoughts={showThoughts && !online ? thoughts : []} showThoughts={showThoughts} setShowThoughts={online ? null : setShowThoughts} />
          )}
          {panel === 'tracker' && <TrackerPanel hand={hand} played={state.played} />}
          {panel === 'scores' && <ScoresPanel state={state} />}
        </aside>
      </main>

      {banner && !modalOpen && (
        <div key={banner.key} className={`banner tone-${banner.tone}`}>
          <div className="banner-title">{banner.title}</div>
          {banner.sub && <div className="banner-sub">{banner.sub}</div>}
        </div>
      )}

      {wishFor && (
        <Modal title="Make a wish" subtitle="The Mah Jong lets you wish for a rank. The next player who can play it must.">
          <div className="wish-grid">
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((r) => (
              <button key={r} className="btn rank" onClick={() => play(wishFor, r)}>
                <RankText label={rankLabel(r)} />
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => { dispatch({ type: 'play', player: me, cards: wishFor, wish: null }) && setSelected([]); setWishFor(null); }}>
              No wish
            </button>
            <button className="btn ghost" onClick={() => setWishFor(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {phase === 'dragonGive' && state.dragonPending?.winner === me && (
        <Modal title="You won with the Dragon" subtitle="The Dragon's trick must be given to an opponent.">
          <div className="modal-actions">
            {[3, 1].map((p) => (
              <button key={p} className="btn primary" onClick={() => dispatch({ type: 'giveDragon', player: me, to: p })}>
                Give to {seatLabel(p)} ({state.hands[p].length} cards)
              </button>
            ))}
            <button className="btn ghost" onClick={askHint}>
              Hint
            </button>
          </div>
          {advice && <p className="modal-note">Coach: {advice.reason}</p>}
        </Modal>
      )}

      {(phase === 'roundOver' || phase === 'gameOver') && (
        <RoundModal
          state={state}
          onNext={() => dispatch({ type: 'nextRound' })}
          onRestart={canRestart ? restart : null}
          onMenu={onMenu}
          menuLabel={menuLabel}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function pickBanner(events: GameEvent[]): Banner | null {
  let b: Banner | null = null;
  for (const e of events) {
    if (e.kind === 'call') {
      b = { key: e.id, title: e.call === 'grand' ? 'GRAND TICHU!' : 'TICHU!', sub: `${seatLabel(e.player)} ${e.player === 0 ? 'call' : 'calls'} it`, tone: 'call' };
    } else if (e.kind === 'play' && isBomb(e.combo)) {
      b = { key: e.id, title: 'BOMB!', sub: `${seatLabel(e.player)} · ${COMBO_NAMES[e.combo.type]}`, tone: 'bomb' };
    } else if (e.kind === 'play' && e.combo.cards[0] === DRAGON && e.combo.type === 'single' && !b) {
      b = { key: e.id, title: 'DRAGON', sub: seatLabel(e.player), tone: 'dragon' };
    } else if (e.kind === 'out' && e.place === 1) {
      b = { key: e.id, title: e.player === 0 ? 'YOU GO OUT FIRST' : `${seatLabel(e.player).toUpperCase()} OUT FIRST`, tone: 'out' };
    } else if (e.kind === 'roundEnd' && e.result.doubleVictory !== null) {
      b = { key: e.id, title: 'DOUBLE VICTORY', sub: e.result.doubleVictory === 0 ? 'Your team: +200' : 'Opponents: +200', tone: 'out' };
    } else if (e.kind === 'dog') {
      b = b ?? { key: e.id, title: 'DOG', sub: `Lead passes to ${seatLabel(e.to)}`, tone: 'info' };
    }
  }
  return b;
}

/** Latest action per seat in the current trick ('pass' or 'play'). */
function recentActs(events: GameEvent[]): Map<number, 'pass' | 'play'> {
  const m = new Map<number, 'pass' | 'play'>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'trick' || e.kind === 'dog' || e.kind === 'exchange' || e.kind === 'deal') break;
    if ((e.kind === 'pass' || e.kind === 'play') && !m.has(e.player)) m.set(e.player, e.kind);
  }
  return m;
}

function CallBadge({ call }: { call: string }) {
  if (call === 'none') return null;
  return <span className={`call-badge ${call}`}>{call === 'grand' ? 'GRAND' : 'TICHU'}</span>;
}

function SeatView({ seat, state, lastAct, tag }: { seat: number; state: GameState; lastAct?: 'pass' | 'play'; tag: string }) {
  const n = state.hands[seat].length;
  const isTurn = (state.phase === 'playing' && state.turn === seat) || (state.phase === 'dragonGive' && state.dragonPending?.winner === seat);
  const place = state.finished.indexOf(seat);
  const fan = Math.min(n, 14);
  return (
    <div className={`seat seat-${SEAT_DIR[seat]} ${isTurn ? 'active' : ''} ${team(seat) === 0 ? 'ally' : 'foe'}`}>
      <div className="seat-head">
        <span className="seat-name">{seatLabel(seat)}</span>
        <span className="seat-role">{tag}</span>
      </div>
      <div className="seat-badges">
        <CallBadge call={state.calls[seat]} />
        {place >= 0 && <span className="out-badge">Out #{place + 1}</span>}
        {state.phase === 'grandTichu' && !state.grandDecided[seat] && <span className="thinking">deciding…</span>}
        {state.phase === 'passing' && !state.passChoices[seat] && <span className="thinking">passing…</span>}
      </div>
      <div className="seat-fan">
        {Array.from({ length: fan }, (_, i) => (
          <Card key={i} faceDown size="sm" style={{ ['--i' as string]: i, ['--n' as string]: fan }} />
        ))}
        {n > 0 && <span className="count">{n}</span>}
      </div>
      {lastAct === 'pass' && state.phase === 'playing' && <div className="pass-bubble">Pass</div>}
    </div>
  );
}

interface ActionBarProps {
  state: GameState;
  opts: ReturnType<typeof playOptions>;
  selected: CardId[];
  selLegal: boolean;
  selCombo: Combo | null;
  selStatus: string;
  passSlots: (CardId | null)[];
  setPassSlots: (s: (CardId | null)[]) => void;
  onPlay: () => void;
  onPass: () => void;
  onTichu: () => void;
  onGrand: (call: boolean) => void;
  onConfirmPass: () => void;
  onClear: () => void;
  onHint: () => void;
}

function ActionBar(p: ActionBarProps) {
  const { state } = p;
  const me = 0;
  const tichuBtn = canCallTichu(state, me) && (
    <button className="btn call" onClick={p.onTichu} title="+100 if you go out first, −100 otherwise">
      Call Tichu!
    </button>
  );
  const hintBtn = (
    <button className="btn ghost" onClick={p.onHint}>
      Hint
    </button>
  );

  if (state.phase === 'grandTichu') {
    if (state.grandDecided[me]) return <div className="action-bar"><span className="status">Waiting for the others…</span></div>;
    return (
      <div className="action-bar">
        <span className="status">You've seen 8 of your 14 cards.</span>
        <button className="btn call" onClick={() => p.onGrand(true)} title="+200 if you go out first, −200 otherwise">
          Grand Tichu!
        </button>
        <button className="btn primary" onClick={() => p.onGrand(false)}>
          Pick up the rest
        </button>
        {hintBtn}
      </div>
    );
  }

  if (state.phase === 'passing') {
    if (state.passChoices[me]) {
      return (
        <div className="action-bar">
          <span className="status">Waiting for the others to pass…</span>
          {tichuBtn}
        </div>
      );
    }
    return (
      <div className="action-bar passing">
        <div className="pass-slots">
          {PASS_TARGETS.map((t, i) => {
            const c = p.passSlots[i];
            return (
              <div
                key={t.label}
                className={`pass-slot ${t.role}`}
                onClick={() => c !== null && p.setPassSlots(p.passSlots.map((x, j) => (j === i ? null : x)))}
              >
                {c !== null ? <Card id={c} size="md" /> : <div className="slot-empty">?</div>}
                <div className="slot-label">
                  {t.label}
                  <small>{t.role}</small>
                </div>
              </div>
            );
          })}
        </div>
        <div className="pass-controls">
          <span className="status">Click cards to fill the slots (West, partner, East).</span>
          <button className="btn primary" disabled={p.passSlots.some((c) => c === null)} onClick={p.onConfirmPass}>
            Pass cards
          </button>
          {tichuBtn}
          {hintBtn}
        </div>
      </div>
    );
  }

  if (state.phase === 'playing') {
    const out = !isActive(state, me);
    const myTurn = state.turn === me && !out;
    const bombLabel = p.selCombo && isBomb(p.selCombo) ? 'BOMB!' : 'Play';
    return (
      <div className="action-bar">
        <span className={`status ${p.selected.length && !p.selLegal ? 'bad' : ''}`}>
          {out
            ? 'You are out — watch your partner!'
            : p.selStatus || (myTurn ? (state.trick.length ? 'Your turn: beat it or pass.' : 'Your lead: play any combination.') : `${seatLabel(state.turn)} is thinking…`)}
          {myTurn && p.opts.mustFulfill && <b className="must"> Wish {rankLabel(state.wish!)} must be played!</b>}
        </span>
        <button className={`btn primary ${bombLabel === 'BOMB!' ? 'bomb' : ''}`} disabled={!p.selLegal} onClick={p.onPlay}>
          {bombLabel}
        </button>
        <button className="btn danger" disabled={!myTurn || !p.opts.canPass} onClick={p.onPass}>
          Pass
        </button>
        {tichuBtn}
        {!out && hintBtn}
        {p.selected.length > 0 && (
          <button className="btn ghost" onClick={p.onClear}>
            Clear
          </button>
        )}
      </div>
    );
  }
  return <div className="action-bar" />;
}

function LogPanel({ events, thoughts, showThoughts, setShowThoughts }: {
  events: GameEvent[];
  thoughts: { beforeEvent: number; seat: number; text: string }[];
  showThoughts: boolean;
  setShowThoughts: ((b: boolean) => void) | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const items = useMemo(() => {
    const out: { key: string; text: string; kind: string; seat?: number }[] = [];
    let ti = 0;
    const th = thoughts.filter((t) => t.beforeEvent >= (events[0]?.id ?? 0));
    for (const e of events) {
      while (ti < th.length && th[ti].beforeEvent <= e.id) {
        out.push({ key: `t${ti}`, text: th[ti].text, kind: 'thought', seat: th[ti].seat });
        ti++;
      }
      const d = describeEvent(e);
      if (d) out.push({ key: `e${e.id}`, text: d, kind: e.kind });
    }
    return out.slice(-160);
  }, [events, thoughts]);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [items]);
  return (
    <div className="panel log-panel">
      {setShowThoughts && (
        <label className="toggle">
          <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} /> Show bot reasoning
        </label>
      )}
      <div className="log" ref={ref}>
        {items.map((it) => (
          <div key={it.key} className={`log-line k-${it.kind}`}>
            {it.kind === 'thought' && <span className="who">{seatLabel(it.seat!)} thinks:</span>} {it.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackerPanel({ hand, played }: { hand: CardId[]; played: CardId[] }) {
  const mine = new Set(hand);
  const gone = new Set(played);
  const ranks = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const status = (id: CardId) => (mine.has(id) ? 'mine' : gone.has(id) ? 'gone' : 'out');
  return (
    <div className="panel tracker">
      <p className="hint-text">Cards still hidden in other hands (not yours, not played yet). Counting these is a key Tichu skill.</p>
      <div className="tracker-specials">
        {[DRAGON, PHOENIX, DOG, MAHJONG].map((id) => (
          <div key={id} className={`tr-special ${status(id)}`}>
            <Card id={id} size="sm" />
            <span>{status(id) === 'out' ? 'unseen' : status(id) === 'mine' ? 'yours' : 'played'}</span>
          </div>
        ))}
      </div>
      <div className="tracker-grid">
        {ranks.map((r) => {
          const ids = [0, 1, 2, 3].map((s) => s * 13 + r - 2);
          const out = ids.filter((id) => status(id) === 'out').length;
          return (
            <div key={r} className="tr-row">
              <span className="tr-rank"><RankText label={rankLabel(r)} /></span>
              <span className="tr-pips">
                {ids.map((id) => (
                  <i key={id} className={`pip ${status(id)} s-${CARDS[id].suit}`} />
                ))}
              </span>
              <span className={`tr-count ${out === 0 ? 'zero' : ''}`}><RankText label={String(out)} /></span>
            </div>
          );
        })}
      </div>
      <div className="tracker-legend">
        <span><i className="pip out" /> unseen</span>
        <span><i className="pip mine" /> yours</span>
        <span><i className="pip gone" /> played</span>
      </div>
    </div>
  );
}

function ScoresPanel({ state }: { state: GameState }) {
  return (
    <div className="panel scores">
      <table>
        <thead>
          <tr>
            <th>Rnd</th>
            <th>Us</th>
            <th>Them</th>
          </tr>
        </thead>
        <tbody>
          {state.history.map((r) => (
            <tr key={r.round}>
              <td>{r.round}</td>
              <td className={r.total[0] >= 0 ? 'pos' : 'neg'}>{r.total[0]}</td>
              <td className={r.total[1] >= 0 ? 'pos' : 'neg'}>{r.total[1]}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Σ</td>
            <td>{state.scores[0]}</td>
            <td>{state.scores[1]}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint-text">
        Points: 5s = 5, 10s & Kings = 10, Dragon = 25, Phoenix = −25. Tichu ±100, Grand Tichu ±200. Going out 1st & 2nd as a team = 200.
      </p>
    </div>
  );
}

function Modal({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">{title}</h2>
        {subtitle && <p className="modal-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function RoundModal({ state, onNext, onRestart, onMenu, menuLabel }: { state: GameState; onNext: () => void; onRestart: (() => void) | null; onMenu: () => void; menuLabel: string }) {
  const r = state.history[state.history.length - 1];
  const over = state.phase === 'gameOver';
  const won = state.scores[0] > state.scores[1];
  const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <Modal title={over ? (won ? 'Victory!' : 'Defeat') : `Round ${r.round} complete`} subtitle={r.doubleVictory !== null ? 'Double victory!' : `Finish order: ${r.finished.map(seatLabel).join(' → ')}`}>
      <table className="round-table">
        <thead>
          <tr>
            <th />
            <th>Your team</th>
            <th>Opponents</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Card points</td>
            <td>{fmt(r.cardPoints[0])}</td>
            <td>{fmt(r.cardPoints[1])}</td>
          </tr>
          <tr>
            <td>Tichu calls</td>
            <td>{fmt(r.tichuPoints[0])}</td>
            <td>{fmt(r.tichuPoints[1])}</td>
          </tr>
          <tr className="sum">
            <td>Round</td>
            <td>{fmt(r.total[0])}</td>
            <td>{fmt(r.total[1])}</td>
          </tr>
          <tr className="grand">
            <td>Game</td>
            <td>{state.scores[0]}</td>
            <td>{state.scores[1]}</td>
          </tr>
        </tbody>
      </table>
      <div className="calls-summary">
        {r.calls.map((c, p) =>
          c === 'none' ? null : (
            <span key={p} className={`call-result ${r.finished[0] === p ? 'made' : 'failed'}`}>
              {seatLabel(p)}: {c === 'grand' ? 'Grand Tichu' : 'Tichu'} {r.finished[0] === p ? 'made ✓' : 'failed ✗'}
            </span>
          ),
        )}
      </div>
      <div className="modal-actions">
        {over ? (
          <>
            {onRestart ? (
              <button className="btn primary" onClick={onRestart}>
                New game
              </button>
            ) : (
              <span className="modal-note">Waiting for the host to start a new game…</span>
            )}
            <button className="btn ghost" onClick={onMenu}>
              {menuLabel}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={onNext}>
            Next round
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Every play in the current trick, oldest first. */
function TrickHistory({ plays, pinned, onClose }: { plays: GameState['trick']; pinned: boolean; onClose: () => void }) {
  const cards = plays.flatMap((t) => t.combo.cards);
  const pts = cards.reduce((a, id) => a + CARDS[id].points, 0);
  return (
    <div className={`trick-history ${pinned ? 'pinned' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="th-head">
        <span>
          This trick · {plays.length} play{plays.length === 1 ? '' : 's'} · {pts} pts
        </span>
        {pinned && (
          <button className="btn tiny ghost" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <ol className="th-list">
        {plays.map((t, i) => (
          <li key={i} className={i === plays.length - 1 ? 'winning' : ''}>
            <span className="th-who">{seatLabel(t.player)}</span>
            <span className="th-cards">
              {t.combo.cards.map((c) => (
                <Card key={c} id={c} size="sm" />
              ))}
            </span>
            <span className="th-what">
              {describeCombo(t.combo)}
              {i === plays.length - 1 && <b className="th-win"> winning</b>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
