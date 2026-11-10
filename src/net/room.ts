import { randomUUID } from 'node:crypto';
import { Bot, BotLevel, botDelay, makeBot, nextBotDecision } from '../bots';
import { GameState, IllegalAction, applyAction, newGame } from '../engine/game';
import { ClientMsg, LobbyInfo, SeatInfo, ServerMsg, absoluteAction, clientState } from './protocol';

export interface Member {
  id: string;
  token: string;
  name: string;
  seat: number | null;
  connected: boolean;
  send: (m: ServerMsg) => void;
}

export interface RoomOptions {
  /** Multiplier on bot thinking time (0 = instant, used in tests). */
  speed?: number;
  seed?: number;
}

/** One lobby / table. Transport-agnostic: the server wires `send` to a WebSocket. */
export class Room {
  readonly members = new Map<string, Member>();
  seats: SeatInfo[] = [{ kind: 'empty' }, { kind: 'empty' }, { kind: 'empty' }, { kind: 'empty' }];
  hostId = '';
  state: GameState | null = null;
  targetScore = 1000;
  cardTracker = true;
  lastActivity = Date.now();
  private bots: (Bot | null)[] = [null, null, null, null];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    private opts: RoomOptions = {},
  ) {}

  // ---------------------------------------------------------------- membership
  join(name: string, send: (m: ServerMsg) => void, token?: string): Member {
    this.lastActivity = Date.now();
    const existing = token ? [...this.members.values()].find((m) => m.token === token) : undefined;
    if (existing) {
      existing.send = send;
      existing.connected = true;
      if (name) existing.name = cleanName(name);
      this.syncSeatNames();
      send({ t: 'welcome', code: this.code, memberId: existing.id, token: existing.token });
      this.broadcast();
      return existing;
    }
    const m: Member = { id: randomUUID(), token: randomUUID(), name: cleanName(name), seat: null, connected: true, send };
    this.members.set(m.id, m);
    if (!this.hostId) this.hostId = m.id;
    send({ t: 'welcome', code: this.code, memberId: m.id, token: m.token });
    // auto-seat newcomers in the first open seat (empty first, then bots before the game starts)
    const empty = this.seats.findIndex((s) => s.kind === 'empty');
    if (empty >= 0) this.sit(m, empty);
    else this.broadcast();
    return m;
  }

  disconnect(memberId: string) {
    const m = this.members.get(memberId);
    if (!m) return;
    m.connected = false;
    this.lastActivity = Date.now();
    this.syncSeatNames();
    if (this.hostId === memberId) {
      const next = [...this.members.values()].find((x) => x.connected);
      if (next) this.hostId = next.id;
    }
    this.broadcast();
  }

  leave(memberId: string) {
    const m = this.members.get(memberId);
    if (!m) return;
    if (m.seat !== null) this.vacate(m.seat);
    this.members.delete(memberId);
    if (this.hostId === memberId) this.hostId = [...this.members.values()].find((x) => x.connected)?.id ?? '';
    this.broadcast();
    this.scheduleBots();
  }

  get empty() {
    return ![...this.members.values()].some((m) => m.connected);
  }

  // ---------------------------------------------------------------- seats
  private vacate(seat: number) {
    const s = this.seats[seat];
    if (s.kind === 'human') {
      const m = this.members.get(s.memberId);
      if (m) m.seat = null;
    }
    // mid-game a vacated seat is taken over by a bot so play can continue
    this.seats[seat] = this.state ? { kind: 'bot', level: 'normal' } : { kind: 'empty' };
    this.refreshBots();
  }

  private sit(m: Member, seat: number) {
    if (m.seat !== null) this.vacate(m.seat);
    this.seats[seat] = { kind: 'human', memberId: m.id, name: m.name, connected: m.connected };
    m.seat = seat;
    this.refreshBots();
    this.broadcast();
    this.scheduleBots();
  }

  private syncSeatNames() {
    for (const s of this.seats) {
      if (s.kind !== 'human') continue;
      const m = this.members.get(s.memberId);
      if (m) {
        s.name = m.name;
        s.connected = m.connected;
      }
    }
  }

  private refreshBots() {
    this.bots = this.seats.map((s) => (s.kind === 'bot' ? makeBot(s.level) : null));
  }

  // ---------------------------------------------------------------- messages
  handle(memberId: string, msg: ClientMsg) {
    const m = this.members.get(memberId);
    if (!m) return;
    this.lastActivity = Date.now();
    const isHost = memberId === this.hostId;
    const fail = (message: string) => m.send({ t: 'error', message });
    switch (msg.t) {
      case 'sit': {
        const target = this.seats[msg.seat];
        if (!target) return fail('No such seat');
        if (target.kind === 'human' && target.memberId !== m.id) {
          if (target.connected) return fail('That seat is taken');
          // allow taking over a disconnected player's seat only before the game
          if (this.state) return fail('That player may come back — ask the host to swap them for a bot first');
          const other = this.members.get(target.memberId);
          if (other) other.seat = null;
        }
        return this.sit(m, msg.seat);
      }
      case 'stand':
        if (m.seat === null) return;
        this.vacate(m.seat);
        this.broadcast();
        return this.scheduleBots();
      case 'setSeat': {
        if (!isHost) return fail('Only the host can change seats');
        const target = this.seats[msg.seat];
        if (!target) return fail('No such seat');
        if (target.kind === 'human') {
          if (target.connected && target.memberId !== m.id) return fail('Ask that player to stand up first');
          const other = this.members.get(target.memberId);
          if (other) other.seat = null;
        }
        if (msg.level === null && this.state) return fail('Seats must be filled during a game');
        this.seats[msg.seat] = msg.level ? { kind: 'bot', level: msg.level } : { kind: 'empty' };
        this.refreshBots();
        this.broadcast();
        return this.scheduleBots();
      }
      case 'setTarget':
        if (!isHost) return fail('Only the host can change the target score');
        if (![200, 500, 1000].includes(msg.targetScore)) return fail('Bad target');
        this.targetScore = msg.targetScore;
        return this.broadcast();
      case 'setOptions':
        if (!isHost) return fail('Only the host can change game settings');
        this.cardTracker = !!msg.cardTracker;
        return this.broadcast();
      case 'start':
      case 'restart':
        if (!isHost) return fail('Only the host can start the game');
        if (msg.t === 'start' && this.state) return fail('Already started');
        this.seats = this.seats.map((s) => (s.kind === 'empty' ? { kind: 'bot', level: 'normal' } : s));
        this.refreshBots();
        this.state = newGame({ targetScore: this.targetScore, seed: this.opts.seed });
        this.broadcast();
        return this.scheduleBots();
      case 'action': {
        if (!this.state) return fail('Game has not started');
        if (msg.action.type === 'nextRound') {
          if (m.seat === null) return fail('Spectators cannot deal');
          return this.apply(msg.action, m);
        }
        if (m.seat === null) return fail('You are not seated');
        return this.apply(absoluteAction(msg.action, m.seat), m);
      }
      default:
        return;
    }
  }

  private apply(action: Parameters<typeof applyAction>[1], by?: Member) {
    if (!this.state) return;
    try {
      this.state = applyAction(this.state, action);
    } catch (e) {
      if (e instanceof IllegalAction) {
        by?.send({ t: 'error', message: e.message });
        return;
      }
      throw e;
    }
    this.broadcast(true);
    this.scheduleBots();
  }

  // ---------------------------------------------------------------- bots
  private scheduleBots() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const s = this.state;
    if (!s || s.phase === 'roundOver' || s.phase === 'gameOver') return;
    if (!nextBotDecision(s, this.bots)) return;
    const speed = this.opts.speed ?? 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.state) return;
      const d = nextBotDecision(this.state, this.bots);
      if (d) this.apply(d.action);
    }, botDelay(s) * speed);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }

  // ---------------------------------------------------------------- broadcast
  lobbyInfo(): LobbyInfo {
    return {
      code: this.code,
      hostId: this.hostId,
      seats: this.seats.map((s) => ({ ...s })),
      started: !!this.state,
      targetScore: this.targetScore,
      cardTracker: this.cardTracker,
      spectators: [...this.members.values()].filter((m) => m.seat === null && m.connected).map((m) => m.name),
    };
  }

  private broadcast(stateOnly = false) {
    const lobby = this.lobbyInfo();
    for (const m of this.members.values()) {
      if (!m.connected) continue;
      if (!stateOnly) m.send({ t: 'lobby', lobby, you: { memberId: m.id, seat: m.seat } });
      if (this.state) {
        const seat = m.seat ?? 0;
        m.send({ t: 'state', state: clientState(this.state, seat, m.seat === null), seat });
      }
    }
  }
}

function cleanName(name: string): string {
  const n = (name ?? '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16);
  return n || 'Player';
}

/** Registry of rooms with idle cleanup. */
export class RoomRegistry {
  readonly rooms = new Map<string, Room>();
  constructor(
    private opts: RoomOptions,
    private makeCode: () => string,
  ) {}

  create(): Room {
    let code = this.makeCode();
    while (this.rooms.has(code)) code = this.makeCode();
    const r = new Room(code, this.opts);
    this.rooms.set(code, r);
    return r;
  }

  get(code: string) {
    return this.rooms.get(code.toUpperCase().trim());
  }

  /** Drop rooms nobody has been connected to for `idleMs`. */
  sweep(idleMs = 30 * 60 * 1000) {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      if (r.empty && now - r.lastActivity > idleMs) {
        r.dispose();
        this.rooms.delete(code);
      }
    }
  }
}

export type { BotLevel };
