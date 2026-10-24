// Exercise generator: random candidates that keep each stall's structure (and the tool it
// teaches). Candidates are only accepted after the solver proves them (see scripts/gen-variants.ts);
// the game itself plays the verified variants stored in variants.json. Pure TS.
import type { Kind } from './rules.ts';

export interface VariantScale {
  x: number;
  L: Kind[];
  R: Kind[];
}

export interface Variant {
  scales: VariantScale[];
  supply: Kind[];
  /** Safe solution (solver move list) — replayed by the tests. Empty for the bonus. */
  moves: string[];
}

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, xs: T[]) => xs[Math.floor(rng() * xs.length)];

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Random split of n into blocks from `allowed` (biggest-first random), or null if too many items. */
export function decompose(rng: Rng, n: number, allowed: number[], maxItems = 6): Kind[] | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const out: Kind[] = [];
    let left = n;
    while (left > 0) {
      const fits = allowed.filter((v) => v <= left);
      if (!fits.length) break;
      // prefer bigger blocks a bit so pans don't fill with 1s
      const v = rng() < 0.55 ? Math.max(...fits) : pick(rng, fits);
      out.push(`w${v}` as Kind);
      left -= v;
    }
    if (left === 0 && out.length <= maxItems) return out;
  }
  return null;
}

const rep = <T>(k: T, n: number) => Array.from({ length: n }, () => k);

/** One random candidate shaped like the stall's authored exercise. */
export function candidate(stallId: string, rng: Rng): Variant | null {
  switch (stallId) {
    case 'melon': {
      // x + a = b; the constant on the left already exists as blocks on the right (no tools)
      const x = int(rng, 2, 8);
      const a = int(rng, 2, 5);
      const left = decompose(rng, a, [2, 1], 3);
      const rest = decompose(rng, x, [5, 2, 1], 4);
      if (!left || !rest) return null;
      return { scales: [{ x, L: ['sack', ...left], R: shuffle(rng, [...left, ...rest]) }], supply: [], moves: [] };
    }
    case 'two-sacks': {
      // 2x + c = d; the right side needs changing before c can come off and before ÷2
      const x = int(rng, 2, 7);
      const c = int(rng, 1, 3);
      const left = decompose(rng, c, [2, 1], 2);
      const right = decompose(rng, 2 * x + c, [10, 5, 2], 4);
      if (!left || !right) return null;
      return { scales: [{ x, L: ['sack', 'sack', ...left], R: shuffle(rng, right) }], supply: [], moves: [] };
    }
    case 'both-pans': {
      // ax + c = bx + d with sacks on both pans
      const [a, b] = pick(rng, [
        [3, 1],
        [4, 2],
        [4, 1],
        [3, 1],
      ]);
      const x = int(rng, 2, 5);
      const c = int(rng, 1, 4);
      const d = (a - b) * x + c;
      const left = decompose(rng, c, [2, 1], 2);
      const right = decompose(rng, d, [5, 2, 1], 6);
      if (!left || !right) return null;
      return { scales: [{ x, L: [...rep<Kind>('sack', a), ...left], R: [...rep<Kind>('sack', b), ...shuffle(rng, right)] }], supply: [], moves: [] };
    }
    case 'change-box': {
      // 2x + c = d with a 10 kg block that has to be changed
      const x = int(rng, 3, 9);
      const c = pick(rng, [2, 3, 5]);
      const d = 2 * x + c;
      if (d < 12) return null;
      const left = decompose(rng, c, [5, 2, 1], 2);
      const rest = decompose(rng, d - 10, [5, 2, 1], 3);
      if (!left || !rest) return null;
      return { scales: [{ x, L: ['sack', 'sack', ...left], R: shuffle(rng, ['w10', ...rest]) }], supply: [], moves: [] };
    }
    case 'balloons': {
      // ax − m = bx + d with helium balloons and a crate of 1 kg blocks
      const [a, b] = pick(rng, [
        [3, 1],
        [4, 2],
      ]);
      const x = int(rng, 2, 6);
      const m = int(rng, 1, 3);
      const d = (a - b) * x - m;
      if (d < 2) return null;
      const right = decompose(rng, d, [5, 2, 1], 5);
      if (!right) return null;
      return {
        scales: [{ x, L: [...rep<Kind>('sack', a), ...rep<Kind>('balloon', m)], R: [...rep<Kind>('sack', b), ...shuffle(rng, right)] }],
        supply: rep<Kind>('w1', 2 * m),
        moves: [],
      };
    }
    case 'two-vendors': {
      // 4x + c = 2x + d under two watchers
      const x = int(rng, 2, 6);
      const c = int(rng, 1, 4);
      const d = 2 * x + c;
      const left = decompose(rng, c, [2, 1], 2);
      const right = decompose(rng, d, [5, 2, 1], 6);
      if (!left || !right) return null;
      return { scales: [{ x, L: ['sack', 'sack', 'sack', 'sack', ...left], R: ['sack', 'sack', ...shuffle(rng, right)] }], supply: [], moves: [] };
    }
    case 'spice': {
      // 5x − m = 2x + d with jars: ÷3 at the end
      const x = int(rng, 3, 6);
      const m = int(rng, 2, 4);
      const d = 3 * x - m;
      const right = decompose(rng, d, [10, 5, 2, 1], 3);
      if (!right) return null;
      return {
        scales: [{ x, L: [...rep<Kind>('jar', 5), ...rep<Kind>('balloon', m)], R: ['jar', 'jar', ...shuffle(rng, right)] }],
        supply: [...rep<Kind>('w1', m), 'w2', 'w2'],
        moves: [],
      };
    }
    case 'rigged': {
      // one identity and one contradiction, in a random order
      const x = int(rng, 2, 6);
      const a = int(rng, 2, 6);
      let b = int(rng, 2, 7);
      if (b === a) b = a + 1;
      const idL = decompose(rng, a, [5, 2, 1], 3);
      const idR = decompose(rng, a, [2, 1], 4);
      const noL = decompose(rng, a, [5, 2, 1], 3);
      const noR = decompose(rng, b, [5, 2, 1], 3);
      if (!idL || !idR || !noL || !noR) return null;
      const identity: VariantScale = { x, L: ['sack', ...idL], R: ['sack', ...idR] };
      const contradiction: VariantScale = { x, L: ['sack', ...noL], R: ['sack', ...noR] };
      return { scales: rng() < 0.5 ? [identity, contradiction] : [contradiction, identity], supply: [], moves: [] };
    }
  }
  return null;
}

/** A stable text key for a variant (used to avoid duplicates). */
export function variantKey(v: Variant): string {
  const bag = (k: Kind[]) => [...k].sort().join(',');
  return v.scales.map((s) => `${s.x}:${bag(s.L)}|${bag(s.R)}`).join('/') + `#${bag(v.supply)}`;
}
