// Pure vendor attention cycle. No Three.js, no DOM.
// away (humming, back turned) → warning ("?", head turning) → looking (watches the scale) → away …
// A honk from beside/behind the vendor makes them look the other way for a while.

export type VendorMode = 'away' | 'warning' | 'looking' | 'distracted' | 'shooing' | 'asleep' | 'happy';

export interface Vec2 {
  x: number;
  z: number;
}

export interface VendorConfig {
  /** Away durations in seconds, cycled in order so the rhythm is learnable. */
  away: number[];
  warn: number;
  look: number;
  distract: number;
  /** Seconds already elapsed in the first away phase (offsets two vendors). */
  offset: number;
  pos: Vec2;
  scalePos: Vec2;
  asleep?: boolean;
}

export interface VendorState {
  mode: VendorMode;
  /** Seconds left in the current mode. */
  t: number;
  /** Index into config.away for the next away phase. */
  idx: number;
  /** Where the vendor is looking while distracted (the honk origin). */
  lookAt?: Vec2;
}

export const HONK_COOLDOWN = 5;
export const SHOO_TIME = 2.4;
/** A honk counts as "behind" when the angle between vendor→goose and vendor→scale is at least this. */
export const DISTRACT_ANGLE_DEG = 80;
/** After a distraction, the vendor goes back to work for this long before the next look. */
export const AFTER_DISTRACT_AWAY = 1.8;

export function initVendor(cfg: VendorConfig): VendorState {
  if (cfg.asleep) return { mode: 'asleep', t: Infinity, idx: 0 };
  const first = cfg.away[0] ?? 5;
  return { mode: 'away', t: Math.max(0.5, first - cfg.offset), idx: 1 % Math.max(1, cfg.away.length) };
}

export function watchesScale(v: VendorState): boolean {
  return v.mode === 'looking';
}

function nextAway(v: VendorState, cfg: VendorConfig): VendorState {
  const t = cfg.away[v.idx % cfg.away.length];
  return { mode: 'away', t, idx: (v.idx + 1) % cfg.away.length };
}

/** Advance the cycle by dt seconds (may pass through several modes). */
export function tickVendor(v: VendorState, cfg: VendorConfig, dt: number): VendorState {
  let s: VendorState = { ...v };
  let left = dt;
  let guard = 0;
  while (left > 0 && guard++ < 32) {
    if (s.mode === 'asleep' || s.mode === 'happy') return s;
    if (s.t > left) {
      s.t -= left;
      return s;
    }
    left -= s.t;
    switch (s.mode) {
      case 'away':
        s = { mode: 'warning', t: cfg.warn, idx: s.idx };
        break;
      case 'warning':
        s = { mode: 'looking', t: cfg.look, idx: s.idx };
        break;
      case 'looking':
      case 'shooing':
        s = nextAway(s, cfg);
        break;
      case 'distracted':
        s = { mode: 'away', t: AFTER_DISTRACT_AWAY, idx: s.idx };
        break;
    }
  }
  return s;
}

export function angleDeg(cfg: VendorConfig, goose: Vec2): number {
  const ax = cfg.scalePos.x - cfg.pos.x;
  const az = cfg.scalePos.z - cfg.pos.z;
  const bx = goose.x - cfg.pos.x;
  const bz = goose.z - cfg.pos.z;
  const la = Math.hypot(ax, az);
  const lb = Math.hypot(bx, bz);
  if (la === 0 || lb === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Is a honk from here pulling the vendor's eyes away from the scale? */
export function honkDistracts(cfg: VendorConfig, goose: Vec2): boolean {
  return angleDeg(cfg, goose) >= DISTRACT_ANGLE_DEG;
}

export type HonkEffect = 'distracted' | 'noticed' | 'ignored';

/**
 * Honk heard by this vendor. From beside/behind: they turn toward the noise, away from the scale.
 * From the scale side: they turn toward the goose — which means toward the scale (a warning starts).
 */
export function honkVendor(v: VendorState, cfg: VendorConfig, goose: Vec2): { state: VendorState; effect: HonkEffect } {
  if (v.mode === 'asleep' || v.mode === 'happy' || v.mode === 'shooing') return { state: v, effect: 'ignored' };
  if (honkDistracts(cfg, goose)) {
    return { state: { mode: 'distracted', t: cfg.distract, idx: v.idx, lookAt: { ...goose } }, effect: 'distracted' };
  }
  if (v.mode === 'away' || v.mode === 'distracted') {
    return { state: { mode: 'warning', t: cfg.warn, idx: v.idx }, effect: 'noticed' };
  }
  return { state: v, effect: 'noticed' };
}

export function shoo(v: VendorState): VendorState {
  return { mode: 'shooing', t: SHOO_TIME, idx: v.idx };
}

export function celebrate(v: VendorState): VendorState {
  return { mode: 'happy', t: Infinity, idx: v.idx };
}
