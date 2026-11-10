/**
 * Sound effects, synthesised with the Web Audio API (no audio files):
 * small chiptune-style sounds for the special cards and bombs.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created/resumed on the first pointer or key press (see initSfx).
 */

export type SoundName = 'dog' | 'phoenix' | 'dragon' | 'mahjong' | 'bomb';

type Synth = (c: BaseAudioContext, out: AudioNode, t: number) => void;

// ---------------------------------------------------------------- building blocks

/** One oscillator note with a pitch glide and an attack/decay envelope. */
function tone(
  c: BaseAudioContext,
  out: AudioNode,
  t: number,
  o: { type: OscillatorType; f0: number; f1?: number; dur: number; gain: number; attack?: number; detune?: number; glide?: 'exp' | 'lin' },
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type;
  osc.detune.value = o.detune ?? 0;
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) {
    if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, t + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
  }
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
  return osc;
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(c: BaseAudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = c.sampleRate * 1.5;
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  noiseBuf = b;
  return b;
}

/** Filtered white noise burst with a sweeping filter. */
function noise(
  c: BaseAudioContext,
  out: AudioNode,
  t: number,
  o: { dur: number; gain: number; filter: BiquadFilterType; f0: number; f1?: number; q?: number; attack?: number },
) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = o.filter;
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const g = c.createGain();
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + o.dur + 0.02);
}

// ---------------------------------------------------------------- the sounds

/** Two quick 8-bit barks: square-wave pitch drop plus a breathy noise burst. */
const dog: Synth = (c, out, t) => {
  for (const [dt, pitch] of [
    [0, 1],
    [0.2, 0.86],
  ] as const) {
    tone(c, out, t + dt, { type: 'square', f0: 520 * pitch, f1: 170 * pitch, dur: 0.13, gain: 0.22, attack: 0.004 });
    tone(c, out, t + dt, { type: 'triangle', f0: 300 * pitch, f1: 120 * pitch, dur: 0.12, gain: 0.25 });
    noise(c, out, t + dt, { dur: 0.08, gain: 0.18, filter: 'bandpass', f0: 1400, f1: 600, q: 1.5 });
  }
};

/** Rising sparkly arpeggio over an upward whoosh, ending in a shimmer. */
const phoenix: Synth = (c, out, t) => {
  noise(c, out, t, { dur: 0.55, gain: 0.13, filter: 'bandpass', f0: 600, f1: 7000, q: 2, attack: 0.15 });
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568]; // C5 E5 G5 C6 E6 G6
  notes.forEach((f, i) => {
    tone(c, out, t + i * 0.055, { type: 'triangle', f0: f, dur: 0.16, gain: 0.27 });
    tone(c, out, t + i * 0.055, { type: 'square', f0: f * 2, dur: 0.06, gain: 0.05 });
  });
  // shimmer with vibrato
  const end = t + notes.length * 0.055;
  const osc = tone(c, out, end, { type: 'sine', f0: 2093, dur: 0.45, gain: 0.13, attack: 0.02 });
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = 14;
  depth.gain.value = 40;
  lfo.connect(depth).connect(osc.frequency);
  lfo.start(end);
  lfo.stop(end + 0.5);
};

/** Low wobbling growl that swells into a roar, over a rumble. */
const dragon: Synth = (c, out, t) => {
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.linearRampToValueAtTime(1300, t + 0.35);
  lp.frequency.exponentialRampToValueAtTime(250, t + 1.1);
  lp.Q.value = 4;
  lp.connect(out);
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = 17; // growl flutter
  depth.gain.value = 9;
  lfo.connect(depth);
  for (const detune of [0, 32, -18]) {
    const o = tone(c, lp, t, { type: 'sawtooth', f0: 70, f1: 115, dur: 0.35, gain: 0.16, attack: 0.08, detune, glide: 'lin' });
    depth.connect(o.frequency);
    const o2 = tone(c, lp, t + 0.3, { type: 'sawtooth', f0: 115, f1: 48, dur: 0.85, gain: 0.17, attack: 0.03, detune });
    depth.connect(o2.frequency);
  }
  lfo.start(t);
  lfo.stop(t + 1.2);
  noise(c, out, t + 0.05, { dur: 1.0, gain: 0.16, filter: 'lowpass', f0: 900, f1: 120, attack: 0.12 });
};

/** Bird chirp: two quick rising whistles. */
const mahjong: Synth = (c, out, t) => {
  for (const dt of [0, 0.11]) {
    tone(c, out, t + dt, { type: 'sine', f0: 2300, f1: 3600, dur: 0.07, gain: 0.26 });
    tone(c, out, t + dt + 0.05, { type: 'sine', f0: 3400, f1: 2600, dur: 0.05, gain: 0.13 });
  }
};

/** Explosion: low thump plus a noise burst whose filter closes down. */
const bomb: Synth = (c, out, t) => {
  tone(c, out, t, { type: 'sine', f0: 150, f1: 35, dur: 0.7, gain: 0.42, attack: 0.002 });
  tone(c, out, t, { type: 'square', f0: 90, f1: 30, dur: 0.25, gain: 0.12 });
  noise(c, out, t, { dur: 0.9, gain: 0.3, filter: 'lowpass', f0: 4000, f1: 90, attack: 0.002 });
  noise(c, out, t + 0.05, { dur: 0.5, gain: 0.08, filter: 'highpass', f0: 3000, f1: 1500 });
};

export const SOUNDS: Record<SoundName, Synth> = { dog, phoenix, dragon, mahjong, bomb };

// ---------------------------------------------------------------- playback

const KEY = 'tichu.sound';
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor(); // keeps overlapping sounds from clipping
    master.connect(comp).connect(ctx.destination);
  }
  return ctx;
}

/** Call once at startup: unlocks audio on the first user gesture. */
export function initSfx() {
  const unlock = () => {
    const c = context();
    if (c && c.state === 'suspended') void c.resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  const out = master;
  if (c.state === 'running') return SOUNDS[name](c, out, c.currentTime + 0.01);
  // first sound right after a click: audio is still waking up. Play it if that
  // happens promptly; never replay stale sounds later.
  const asked = performance.now();
  void c.resume().then(() => {
    if (performance.now() - asked < 400) SOUNDS[name](c, out, c.currentTime + 0.01);
  });
}

export const soundEnabled = () => enabled;
export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
