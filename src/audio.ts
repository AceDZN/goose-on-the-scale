// Procedural WebAudio sounds. Nothing is downloaded. Starts after the first user gesture.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.6;
  master.connect(ctx.destination);
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.6;
}

export function isMuted(): boolean {
  return muted;
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; to?: number; vol?: number; delay?: number; attack?: number } = {},
): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const vol = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { vol?: number; freq?: number; q?: number; delay?: number } = {}): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = opts.freq ?? 1200;
  f.Q.value = opts.q ?? 0.8;
  const g = ctx.createGain();
  g.gain.value = opts.vol ?? 0.3;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  honk(): void {
    tone(420, 0.28, { type: 'sawtooth', to: 300, vol: 0.25 });
    tone(424, 0.28, { type: 'square', to: 296, vol: 0.08 });
    noise(0.12, { freq: 900, vol: 0.12 });
  },
  grab(): void {
    tone(660, 0.08, { type: 'triangle', to: 880, vol: 0.18 });
  },
  drop(): void {
    tone(220, 0.12, { type: 'triangle', to: 140, vol: 0.22 });
    noise(0.06, { freq: 400, vol: 0.12 });
  },
  clank(): void {
    tone(980, 0.5, { type: 'triangle', vol: 0.12 });
    tone(1470, 0.35, { type: 'sine', vol: 0.08 });
    tone(310, 0.3, { type: 'square', to: 200, vol: 0.06 });
  },
  balance(): void {
    tone(1318, 0.25, { type: 'sine', vol: 0.08 });
  },
  warn(): void {
    tone(520, 0.18, { type: 'sine', to: 700, vol: 0.14 });
    tone(700, 0.22, { type: 'sine', to: 520, vol: 0.12, delay: 0.18 });
  },
  caught(): void {
    tone(300, 0.2, { type: 'square', to: 200, vol: 0.14 });
    tone(200, 0.35, { type: 'square', to: 110, vol: 0.14, delay: 0.18 });
    noise(0.4, { freq: 2200, vol: 0.18, delay: 0.05 });
  },
  pop(): void {
    noise(0.07, { freq: 3000, vol: 0.3 });
    tone(900, 0.06, { type: 'sine', to: 300, vol: 0.12 });
  },
  change(): void {
    for (let i = 0; i < 4; i++) tone(1200 + i * 220, 0.08, { type: 'triangle', vol: 0.12, delay: i * 0.05 });
  },
  share(): void {
    tone(330, 0.15, { type: 'triangle', vol: 0.18 });
    tone(495, 0.2, { type: 'triangle', vol: 0.18, delay: 0.1 });
    noise(0.25, { freq: 600, vol: 0.12, delay: 0.05 });
  },
  boing(): void {
    tone(180, 0.45, { type: 'sine', to: 520, vol: 0.2 });
    tone(520, 0.3, { type: 'sine', to: 160, vol: 0.12, delay: 0.25 });
  },
  solved(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.16, delay: i * 0.11 }));
  },
  whoosh(): void {
    noise(0.7, { freq: 700, q: 0.4, vol: 0.25 });
  },
  splat(): void {
    noise(0.3, { freq: 300, vol: 0.35 });
    tone(140, 0.25, { type: 'sine', to: 60, vol: 0.25 });
  },
  hum(): void {
    tone(392, 0.25, { type: 'sine', vol: 0.04 });
    tone(440, 0.25, { type: 'sine', vol: 0.04, delay: 0.27 });
  },
  step(): void {
    tone(160 + Math.random() * 40, 0.05, { type: 'sine', vol: 0.05 });
  },
  feather(): void {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.4, { type: 'sine', vol: 0.12, delay: i * 0.09 }));
  },
};
