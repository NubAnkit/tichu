# Tichu

A browser version of Tichu: you plus three bots, with two visual themes and a built-in coach.

```bash
npm install
npm run dev          # play solo at http://localhost:5173  (add ?seed=123 for a reproducible deal)
npm run dev:server   # in a second terminal: game server for online lobbies (port 8787)
npm test         # rules, move-generator, fuzz and full bot-game tests
npm run sim -- 40 hard normal   # headless bot-vs-bot match: win rate + Tichu stats
```

## Playing with friends

On the menu, enter your name and **Create lobby**. You get a 4-letter code (and a copy-able invite link
`…/?join=CODE`). Friends enter the code under *Play with friends*. In the lobby you can:

- sit anywhere (partners sit opposite: South+North vs East+West),
- as host, put a Novice/Adept/Master bot in any open seat (open seats default to Adept),
- start the game, and mid-game open **Lobby** from the top bar to swap a dropped player for a bot.

A refresh or dropped connection rejoins automatically into the same seat. The server is authoritative
and each browser only ever receives its own cards (`src/net/protocol.ts` rotates and masks the state).

**Hosting so friends can reach it.** One process serves the site *and* the lobbies:

```bash
npm run build && npm start        # http://localhost:8787 (PORT env var to change)
```

- *Quick test from this Codespace:* run the above, then in the Ports tab set port 8787 to **Public**
  and share that URL. (In dev, making port 5173 public also works; Vite forwards `/ws` to the server.)
- *Permanent:* any Node host (Render, Railway, Fly.io…): build command `npm install && npm run build`,
  start command `npm start`. It needs WebSocket support (all of those have it). Lobbies live in memory,
  so a server restart ends games in progress.

## What's in it

- **Full rules**: Grand Tichu after 8 cards, Tichu calls, 3-card pass, Mah Jong + wish (enforced), Dog,
  Phoenix (wild, single = +½), Dragon (trick given to an opponent), bombs (also out of turn),
  double victory, last player's hand/tricks handling, play to 1000 (or 500/200).
- **Bots**: Novice / Adept / Master, set per seat. Every decision comes with a plain-English reason
  (shown in the log under "Show bot reasoning").
- **Coach**: the **Hint** button asks the Master bot what it would do in your seat, and why.
- **Card Tracker** tab: which cards are still unseen. This is the start of the learning mode.
- **Themes**: *Underworld* (dark, gilded, embers) and *Arcade* (pixel swirl shader, CRT, wobbly cards).
  You can switch mid-game from the top bar.

## Layout

```
src/engine/   pure, deterministic rules engine (no UI). Cards are ints 0..55.
  cards.ts      card table, points, sorting
  combos.ts     parse/compare combinations, legal-move generation (verified against brute force)
  game.ts       state machine: applyAction(state, action) -> new state; seeded RNG; event log
  view.ts       PlayerView = what one seat may see (bots only get this, so they can't cheat)
src/bots/     Bot interface + heuristic bots, hand planner, card counting, headless runner
src/ui/       React UI, themes in src/ui/themes/*.css
src/net/      online play: wire protocol, state masking/rotation, Room (lobby + seats + server-side bots)
server/       HTTP + WebSocket server (serves dist/ and /ws)
scripts/simulate.ts   bot-vs-bot evaluation harness
```

## Toward trained bots

The engine was built for this. State is plain JSON, actions are data, the RNG is seeded, and
`viewFor(state, seat)` gives the exact information set. A trained bot just implements the `Bot`
interface in `src/bots/types.ts`. `simulateGame` / `npm run sim` already give you self-play and evaluation.
Today a round takes about 75 ms with the heuristic bots, mostly spent in move generation.
