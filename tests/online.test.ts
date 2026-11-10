import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../server/index';
import { HeuristicBot, nextBotDecision } from '../src/bots';
import type { GameState } from '../src/engine/game';
import { pendingActors } from '../src/engine/game';
import { HIDDEN, ServerMsg, clientState } from '../src/net/protocol';
import { newGame, applyAction } from '../src/engine/game';

const PORT = 18787;
let server: ReturnType<typeof startServer>;
beforeAll(() => {
  server = startServer(PORT, { speed: 0 });
});
afterAll(async () => {
  await server.close();
});

/** A scripted player: connects, then plays its seat with a bot brain on the masked view. */
class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  state: GameState | null = null;
  seat: number | null = null;
  code = '';
  token = '';
  errors: string[] = [];
  leaked = false;
  brain = new HeuristicBot('normal');
  private actedOn = '';
  ready: Promise<void>;
  constructor(public name: string, public autoplay = true) {
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ready = new Promise((r) => this.ws.once('open', () => r()));
    this.ws.on('message', (raw) => this.onMsg(JSON.parse(String(raw))));
  }
  send(m: object) {
    this.ws.send(JSON.stringify(m));
  }
  onMsg(m: ServerMsg) {
    this.msgs.push(m);
    if (m.t === 'welcome') {
      this.code = m.code;
      this.token = m.token;
    }
    if (m.t === 'lobby') this.seat = m.you.seat;
    if (m.t === 'error') this.errors.push(m.message);
    if (m.t !== 'state') return;
    this.state = m.state;
    // privacy: only my own hand (seat 0 in my frame) may contain real cards
    for (let p = 1; p < 4; p++) if (m.state.hands[p].some((c) => c !== HIDDEN)) this.leaked = true;
    if (m.state.undealt.some((u) => u.length)) this.leaked = true;
    if (this.autoplay) this.act();
  }
  act() {
    const s = this.state!;
    const sig = [s.round, s.phase, s.nextEventId, s.grandDecided, s.passChoices.map((x) => !!x), s.turn, s.calls].join('|');
    if (this.actedOn === sig) return;
    if (s.phase === 'roundOver' && this.seat === 0) {
      this.actedOn = sig;
      return this.send({ t: 'action', action: { type: 'nextRound' } });
    }
    if (!pendingActors(s).includes(0) && !(s.phase === 'playing' && s.trick.length)) return;
    const d = nextBotDecision(s, [this.brain, null, null, null]);
    if (!d || d.seat !== 0) return;
    this.actedOn = sig;
    this.send({ t: 'action', action: d.action });
  }
  waitFor(pred: () => boolean, ms = 60000) {
    return new Promise<void>((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        if (pred()) return resolve();
        if (Date.now() - t0 > ms) return reject(new Error(`timeout waiting (${this.name})`));
        setTimeout(tick, 10);
      };
      tick();
    });
  }
}

describe('clientState masking', () => {
  it('hides other hands and rotates seats/teams', () => {
    let s = newGame({ seed: 5 });
    for (let p = 0; p < 4; p++) s = applyAction(s, { type: 'grandTichu', player: p, call: p === 3 });
    const c = clientState(s, 1);
    expect(c.hands[0]).toEqual(s.hands[1]);
    expect(c.hands[1].every((x) => x === HIDDEN)).toBe(true);
    expect(c.calls[2]).toBe('grand'); // absolute seat 3 is two to the right of seat 1
    s.scores = [100, 40];
    expect(clientState(s, 1).scores).toEqual([40, 100]);
    expect(clientState(s, 2).scores).toEqual([100, 40]);
    expect(clientState(s, 0, true).hands[0].every((x) => x === HIDDEN)).toBe(true);
  });
});

describe('online lobby end-to-end', () => {
  it('two humans + two bots play a full game through the server', async () => {
    const host = new Client('Ankit');
    await host.ready;
    host.send({ t: 'create', name: 'Ankit' });
    await host.waitFor(() => !!host.code);
    expect(host.code).toMatch(/^[A-Z]{4}$/);

    const friend = new Client('Sam');
    await friend.ready;
    friend.send({ t: 'join', code: host.code.toLowerCase(), name: 'Sam' });
    await friend.waitFor(() => friend.seat !== null);
    expect(friend.seat).toBe(1);
    // friend moves to partner seat; host puts a Master bot in an opponent seat
    friend.send({ t: 'sit', seat: 2 });
    host.send({ t: 'setSeat', seat: 1, level: 'hard' });
    host.send({ t: 'setTarget', targetScore: 200 });
    await friend.waitFor(() => friend.seat === 2);
    // non-host can't start
    friend.send({ t: 'start' });
    await friend.waitFor(() => friend.errors.length > 0);
    host.send({ t: 'start' });
    await host.waitFor(() => host.state?.phase === 'gameOver', 90000);
    await friend.waitFor(() => friend.state?.phase === 'gameOver');
    expect(host.leaked || friend.leaked).toBe(false);
    // same team -> same score orientation
    expect(friend.state!.scores).toEqual(host.state!.scores);
    host.ws.close();
    friend.ws.close();
  }, 120000);

  it('four humans, opponents see mirrored scores, and a dropped player can rejoin', async () => {
    const cs = ['A', 'B', 'C', 'D'].map((n) => new Client(n));
    await Promise.all(cs.map((c) => c.ready));
    cs[0].send({ t: 'create', name: 'A' });
    await cs[0].waitFor(() => !!cs[0].code);
    for (const c of cs.slice(1)) {
      c.send({ t: 'join', code: cs[0].code, name: c.name });
      await c.waitFor(() => c.seat !== null);
    }
    expect(cs.map((c) => c.seat)).toEqual([0, 1, 2, 3]);
    cs[0].send({ t: 'setTarget', targetScore: 200 });
    cs[0].send({ t: 'start' });
    await cs[0].waitFor(() => (cs[0].state?.round ?? 0) >= 1 && cs[0].state!.phase === 'playing');

    // player D drops and reconnects with their token, keeping seat 3
    const token = cs[3].token;
    cs[3].ws.close();
    const d2 = new Client('D');
    await d2.ready;
    d2.send({ t: 'join', code: cs[0].code, name: 'D', token });
    await d2.waitFor(() => d2.seat === 3 && !!d2.state);
    cs[3] = d2;

    await Promise.all(cs.map((c) => c.waitFor(() => c.state?.phase === 'gameOver', 90000)));
    expect(cs.some((c) => c.leaked)).toBe(false);
    const [a, b] = cs[0].state!.scores;
    expect(cs[1].state!.scores).toEqual([b, a]);
    expect(cs[2].state!.scores).toEqual([a, b]);
    cs.forEach((c) => c.ws.close());
  }, 120000);

  it('only the host can toggle the Card Tracker, and everyone sees it', async () => {
    const host = new Client('H', false);
    const guest = new Client('G', false);
    await Promise.all([host.ready, guest.ready]);
    host.send({ t: 'create', name: 'H' });
    await host.waitFor(() => !!host.code);
    guest.send({ t: 'join', code: host.code, name: 'G' });
    await guest.waitFor(() => guest.seat !== null);
    const lastLobby = (c: Client) => [...c.msgs].reverse().find((m) => m.t === 'lobby') as Extract<ServerMsg, { t: 'lobby' }>;
    expect(lastLobby(guest).lobby.cardTracker).toBe(true); // on by default
    guest.send({ t: 'setOptions', cardTracker: false });
    await guest.waitFor(() => guest.errors.some((e) => /host/.test(e)));
    expect(lastLobby(guest).lobby.cardTracker).toBe(true);
    host.send({ t: 'setOptions', cardTracker: false });
    await guest.waitFor(() => lastLobby(guest).lobby.cardTracker === false);
    await host.waitFor(() => lastLobby(host).lobby.cardTracker === false);
    host.ws.close();
    guest.ws.close();
  });

  it('rejects unknown codes', async () => {
    const c = new Client('X', false);
    await c.ready;
    c.send({ t: 'join', code: 'ZZZZ', name: 'X' });
    await c.waitFor(() => c.errors.length > 0);
    expect(c.errors[0]).toMatch(/No lobby/);
    c.ws.close();
  });
});
