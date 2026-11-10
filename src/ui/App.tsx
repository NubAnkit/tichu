import { useEffect, useState } from 'react';
import { BOT_LEVELS, BotLevel } from '../bots';
import { DRAGON, PHOENIX, MAHJONG, DOG } from '../engine/cards';
import { Card } from './components/Card';
import { EmberBackground, SwirlBackground } from './components/Backgrounds';
import { GameScreen, SeatDisplay } from './GameScreen';
import { GameConfig, useGame } from './useGame';
import { Lobby } from './Lobby';
import { activeLobby, useOnline } from './online';

export type Theme = 'underworld' | 'arcade';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

const THEMES: { id: Theme; name: string; tagline: string }[] = [
  { id: 'underworld', name: 'Underworld', tagline: 'Gilded tablets, embers and blood-red shadow.' },
  { id: 'arcade', name: 'Arcade', tagline: 'Chunky pixels, CRT glow and juicy, wobbly cards.' },
];

export function App() {
  const [theme, setThemeState] = useState<Theme>(() => load('tichu.theme', 'underworld'));
  const [config, setConfig] = useState<GameConfig>(() =>
    load('tichu.config', { levels: ['normal', 'normal', 'normal'], targetScore: 1000, speed: 1 } as GameConfig),
  );
  const [playing, setPlaying] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const online = useOnline();
  const [name, setNameState] = useState<string>(() => load('tichu.name', ''));
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(location.search).get('join')?.toUpperCase() ?? '');
  const [showLobby, setShowLobby] = useState(false);
  // after a refresh, rejoin the lobby we were in (same seat, thanks to the saved token)
  useEffect(() => {
    const code = activeLobby();
    if (code && load('tichu.name', '').trim()) online.join(code, load('tichu.name', '').trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setName = (n: string) => {
    setNameState(n);
    save('tichu.name', n);
  };
  const leaveOnline = () => {
    online.leave();
    setShowLobby(false);
    if (location.search.includes('join=')) history.replaceState(null, '', location.pathname);
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    save('tichu.theme', t);
  };
  const update = (c: Partial<GameConfig>) => {
    const next = { ...config, ...c };
    setConfig(next);
    save('tichu.config', next);
  };

  if (playing) {
    return <SoloGame key={gameKey} config={config} theme={theme} onTheme={setTheme} onMenu={() => setPlaying(false)} />;
  }

  if (online.status !== 'idle' || online.lobby) {
    const started = online.lobby?.started && online.controller;
    return (
      <div className={`online theme-${theme}`}>
        {started ? (
          <>
            <GameScreen
              game={online.controller!}
              seats={online.seats}
              theme={theme}
              onTheme={setTheme}
              onMenu={leaveOnline}
              menuLabel="Leave"
              online
              canRestart={online.isHost}
              topbarExtra={
                <>
                  {online.status === 'reconnecting' && <span className="pill them">Reconnecting…</span>}
                  <button className="btn small ghost" onClick={() => setShowLobby(true)}>
                    Lobby {online.lobby!.code}
                  </button>
                </>
              }
            />
            {showLobby && (
              <div className={`overlay-root theme-${theme}`}>
                <Lobby online={online} overlay onClose={() => setShowLobby(false)} />
              </div>
            )}
          </>
        ) : (
          <div className={`menu theme-${theme}`}>
            {theme === 'underworld' ? <EmberBackground /> : <SwirlBackground />}
            <div className="menu-inner">
              <h1 className="menu-title small">TICHU</h1>
              <Lobby online={online} />
              <button className="btn ghost" onClick={leaveOnline}>
                Leave lobby
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const setLevel = (i: number, l: BotLevel) => {
    const levels = [...config.levels] as GameConfig['levels'];
    levels[i] = l;
    update({ levels });
  };

  return (
    <div className={`menu theme-${theme}`}>
      {theme === 'underworld' ? <EmberBackground /> : <SwirlBackground />}
      <div className="menu-inner">
        <h1 className="menu-title">TICHU</h1>
        <p className="menu-tag">A climbing card game for four, in two teams.</p>

        <div className="menu-hero">
          {[MAHJONG, DOG, PHOENIX, DRAGON].map((id, i) => (
            <Card key={id} id={id} size="lg" className="hero-card" style={{ ['--i' as string]: i, ['--n' as string]: 4 }} />
          ))}
        </div>

        <div className="menu-section">
          <h3>Style</h3>
          <div className="theme-picker">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme-option ${theme === t.id ? 'active' : ''} opt-${t.id}`} onClick={() => setTheme(t.id)}>
                <span className="theme-name">{t.name}</span>
                <span className="theme-tagline">{t.tagline}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="menu-section">
          <h3>Table</h3>
          <div className="seat-config">
            {[
              { i: 1, label: 'Partner (North)' },
              { i: 0, label: 'Opponent (East)' },
              { i: 2, label: 'Opponent (West)' },
            ].map(({ i, label }) => (
              <label key={i} className="field">
                <span>{label}</span>
                <select value={config.levels[i]} onChange={(e) => setLevel(i, e.target.value as BotLevel)}>
                  {BOT_LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {l.blurb}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="field">
              <span>Play to</span>
              <select value={config.targetScore} onChange={(e) => update({ targetScore: Number(e.target.value) })}>
                <option value={1000}>1000 (standard)</option>
                <option value={500}>500</option>
                <option value={200}>200 (quick)</option>
              </select>
            </label>
            <label className="field">
              <span>Bot speed</span>
              <select value={config.speed} onChange={(e) => update({ speed: Number(e.target.value) })}>
                <option value={1.6}>Relaxed</option>
                <option value={1}>Normal</option>
                <option value={0.5}>Fast</option>
              </select>
            </label>
          </div>
        </div>

        <button
          className="btn primary big"
          onClick={() => {
            setGameKey((k) => k + 1);
            setPlaying(true);
          }}
        >
          Play solo vs bots
        </button>
        <p className="menu-foot">Use <b>Hint</b> any time to see what the Master bot would do and why.</p>
        <div className="menu-section friends">
          <h3>Play with friends</h3>
          <div className="friends-grid">
            <label className="field">
              <span>Your name</span>
              <input value={name} maxLength={16} placeholder="e.g. Ankit" onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="friends-actions">
              <button className="btn primary" disabled={!name.trim()} onClick={() => online.create(name.trim())}>
                Create lobby
              </button>
              <span className="muted">or</span>
              <input
                className="code-input"
                value={joinCode}
                maxLength={4}
                placeholder="CODE"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && joinCode.length === 4 && online.join(joinCode, name.trim())}
              />
              <button className="btn" disabled={!name.trim() || joinCode.length !== 4} onClick={() => online.join(joinCode, name.trim())}>
                Join
              </button>
            </div>
          </div>
          {online.error && <div className="error" onClick={() => online.setError(null)}>{online.error}</div>}
          {joinCode && !name.trim() && <p className="muted small">Enter your name to join lobby {joinCode}.</p>}
        </div>

      </div>
    </div>
  );
}

const SOLO_SEAT_NAMES = ['You', 'East', 'North', 'West'];

function SoloGame({ config, theme, onTheme, onMenu }: { config: GameConfig; theme: Theme; onTheme: (t: Theme) => void; onMenu: () => void }) {
  const game = useGame(config);
  const seats: SeatDisplay[] = SOLO_SEAT_NAMES.map((name, p) => {
    if (p === 0) return { name, tag: 'You' };
    const lvl = BOT_LEVELS.find((l) => l.id === config.levels[p - 1])?.name ?? '';
    return { name, tag: `${p === 2 ? 'Partner' : 'Opponent'} · ${lvl}` };
  });
  return <GameScreen game={game} seats={seats} theme={theme} onTheme={onTheme} onMenu={onMenu} />;
}
