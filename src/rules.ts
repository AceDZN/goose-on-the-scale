// Pure balance rules for Goose on the Scale. No Three.js, no DOM.
// A scale is an equation: each pan is one side (אגף), identical sacks are the
// unknown x (נעלם), blocks are numbers and helium balloons are −1.

export type Kind = 'sack' | 'jar' | 'w1' | 'w2' | 'w5' | 'w10' | 'balloon' | 'pair' | 'bundle';
export type Side = 'L' | 'R';

export interface Item {
  id: number;
  kind: Kind;
  /** Block values inside a change bundle. */
  parts?: number[];
  /** Where the item lies when it is on the ground (scene-only, ignored by rules). */
  pos?: { x: number; z: number };
}

export interface ScaleState {
  /** Hidden weight of one sack/jar on this scale. */
  x: number;
  L: Item[];
  R: Item[];
}

export interface StallState {
  scales: ScaleState[];
  ground: Item[];
  supply: Item[];
  sky: Item[];
  seesaw: Item[];
  beak: Item | null;
  nextId: number;
}

export type Loc =
  | { at: 'pan'; scale: number; side: Side }
  | { at: 'ground' }
  | { at: 'supply' }
  | { at: 'seesaw' };

export type Result =
  | { ok: true; state: StallState; event?: string }
  | { ok: false; reason: string };

export const BLOCK_VALUES: Record<string, number> = { w1: 1, w2: 2, w5: 5, w10: 10 };
export const CHANGE_RECIPES: Record<string, number[]> = { w10: [5, 5], w5: [2, 2, 1], w2: [1, 1] };

export function isUnknown(kind: Kind): boolean {
  return kind === 'sack' || kind === 'jar';
}

export function isBlock(kind: Kind): boolean {
  return kind in BLOCK_VALUES;
}

export function blockKind(value: number): Kind {
  const k = `w${value}`;
  if (!(k in BLOCK_VALUES)) throw new Error(`no block of ${value}`);
  return k as Kind;
}

export function itemValue(item: Item, x: number): number {
  switch (item.kind) {
    case 'sack':
    case 'jar':
      return x;
    case 'balloon':
      return -1;
    case 'pair':
      return 0;
    case 'bundle':
      return (item.parts ?? []).reduce((a, b) => a + b, 0);
    default:
      return BLOCK_VALUES[item.kind];
  }
}

export function panTotal(items: Item[], x: number): number {
  return items.reduce((sum, it) => sum + itemValue(it, x), 0);
}

/** Positive when the left pan is heavier. */
export function difference(scale: ScaleState): number {
  return panTotal(scale.L, scale.x) - panTotal(scale.R, scale.x);
}

export function isBalanced(scale: ScaleState): boolean {
  return difference(scale) === 0;
}

export function tiltSign(scale: ScaleState): -1 | 0 | 1 {
  const d = difference(scale);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

function clone(s: StallState): StallState {
  return structuredClone(s);
}

function listAt(s: StallState, loc: Loc): Item[] {
  switch (loc.at) {
    case 'pan':
      return s.scales[loc.scale][loc.side];
    case 'ground':
      return s.ground;
    case 'supply':
      return s.supply;
    case 'seesaw':
      return s.seesaw;
  }
}

export function grab(state: StallState, loc: Loc, id: number): Result {
  if (state.beak) return { ok: false, reason: 'beak_full' };
  const s = clone(state);
  const list = listAt(s, loc);
  const i = list.findIndex((it) => it.id === id);
  if (i < 0) return { ok: false, reason: 'not_here' };
  const [item] = list.splice(i, 1);
  delete item.pos;
  s.beak = item;
  return { ok: true, state: s, event: item.kind === 'balloon' ? 'balloon_lift' : 'grab' };
}

function newBlocks(s: StallState, parts: number[]): Item[] {
  return parts.map((v) => ({ id: s.nextId++, kind: blockKind(v) }));
}

/** Drop the beak item onto a pan. Bundles split; a 1 kg block meets a balloon and they tie into a zero pair. */
export function dropOnPan(state: StallState, scale: number, side: Side): Result {
  if (!state.beak) return { ok: false, reason: 'beak_empty' };
  const s = clone(state);
  const item = s.beak!;
  s.beak = null;
  const pan = s.scales[scale][side];
  if (item.kind === 'bundle') {
    pan.push(...newBlocks(s, item.parts ?? []));
    return { ok: true, state: s, event: 'bundle_split' };
  }
  if (item.kind === 'w1' || item.kind === 'balloon') {
    const partner = item.kind === 'w1' ? 'balloon' : 'w1';
    const j = pan.findIndex((it) => it.kind === partner);
    if (j >= 0) {
      pan.splice(j, 1);
      pan.push({ id: item.id, kind: 'pair' });
      return { ok: true, state: s, event: 'zero_pair' };
    }
  }
  pan.push(item);
  return { ok: true, state: s, event: 'drop_pan' };
}

/** Drop on the floor. A loose balloon floats away into the awning. */
export function dropOnGround(state: StallState, pos?: { x: number; z: number }): Result {
  if (!state.beak) return { ok: false, reason: 'beak_empty' };
  const s = clone(state);
  const item = s.beak!;
  s.beak = null;
  if (item.kind === 'balloon') {
    s.sky.push(item);
    return { ok: true, state: s, event: 'balloon_away' };
  }
  if (pos) item.pos = { ...pos };
  s.ground.push(item);
  return { ok: true, state: s, event: 'drop_ground' };
}

/** Load the seesaw bucket. Only blocks (and bundles, which split) go in. */
export function dropOnSeesaw(state: StallState): Result {
  if (!state.beak) return { ok: false, reason: 'beak_empty' };
  const item = state.beak;
  if (!isBlock(item.kind) && item.kind !== 'bundle') return { ok: false, reason: 'seesaw_blocks_only' };
  const s = clone(state);
  s.beak = null;
  if (item.kind === 'bundle') s.seesaw.push(...newBlocks(s, item.parts ?? []));
  else s.seesaw.push(item);
  return { ok: true, state: s, event: 'seesaw_load' };
}

/** Change box: a 10, 5 or 2 kg block becomes a bundle of smaller blocks with the same value. */
export function change(state: StallState): Result {
  const item = state.beak;
  if (!item) return { ok: false, reason: 'beak_empty' };
  const recipe = CHANGE_RECIPES[item.kind];
  if (!recipe) return { ok: false, reason: 'cannot_change' };
  const s = clone(state);
  s.beak = { id: item.id, kind: 'bundle', parts: [...recipe] };
  return { ok: true, state: s, event: 'changed' };
}

/**
 * Split block values into k groups of equal sum. Returns groups of indices or null.
 * Values are positive here (balloons and pairs are refused before this is called).
 */
export function partition(values: number[], k: number): number[][] | null {
  const total = values.reduce((a, b) => a + b, 0);
  if (k <= 0 || total % k !== 0) return null;
  const target = total / k;
  const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
  if (order.length && values[order[0]] > target) return null;
  const sums = new Array(k).fill(0);
  const groups: number[][] = Array.from({ length: k }, () => []);
  const place = (n: number): boolean => {
    if (n === order.length) return sums.every((v) => v === target);
    const i = order[n];
    const tried = new Set<number>();
    for (let g = 0; g < k; g++) {
      if (sums[g] + values[i] > target || tried.has(sums[g])) continue;
      tried.add(sums[g]);
      sums[g] += values[i];
      groups[g].push(i);
      if (place(n + 1)) return true;
      sums[g] -= values[i];
      groups[g].pop();
    }
    return false;
  };
  return place(0) ? groups : null;
}

export type ShareFail =
  | { side: Side; why: 'balloons' }
  | { side: Side; why: 'sacks'; sacks: number }
  | { side: Side; why: 'total'; total: number }
  | { side: Side; why: 'blocks'; total: number; biggest: number };

export function shareCheck(scale: ScaleState, k: number): ShareFail | null {
  for (const side of ['L', 'R'] as Side[]) {
    const pan = scale[side];
    if (pan.some((it) => it.kind === 'balloon' || it.kind === 'pair')) return { side, why: 'balloons' };
    const sacks = pan.filter((it) => isUnknown(it.kind)).length;
    if (sacks % k !== 0) return { side, why: 'sacks', sacks };
    const values = pan.filter((it) => !isUnknown(it.kind)).map((it) => itemValue(it, 0));
    const total = values.reduce((a, b) => a + b, 0);
    if (total % k !== 0) return { side, why: 'total', total };
    if (!partition(values, k)) return { side, why: 'blocks', total, biggest: Math.max(...values) };
  }
  return null;
}

/** Share board: keep one of k equal groups on each pan; the rest is pushed onto the floor. */
export function share(state: StallState, scaleIndex: number, k: number): Result {
  if (k < 2) return { ok: false, reason: 'bad_k' };
  const scale = state.scales[scaleIndex];
  if (scale.L.length + scale.R.length === 0) return { ok: false, reason: 'empty' };
  const fail = shareCheck(scale, k);
  if (fail) return { ok: false, reason: `share_${fail.why}_${fail.side}` };
  const s = clone(state);
  const sc = s.scales[scaleIndex];
  for (const side of ['L', 'R'] as Side[]) {
    const pan = sc[side];
    const unknowns = pan.filter((it) => isUnknown(it.kind));
    const blocks = pan.filter((it) => !isUnknown(it.kind));
    const groups = partition(blocks.map((b) => itemValue(b, 0)), k)!;
    const keep = [...unknowns.slice(0, unknowns.length / k), ...groups[0].map((i) => blocks[i])];
    const keepIds = new Set(keep.map((it) => it.id));
    s.ground.push(...pan.filter((it) => !keepIds.has(it.id)));
    sc[side] = pan.filter((it) => keepIds.has(it.id));
  }
  return { ok: true, state: s, event: 'shared' };
}

/** One sack (or jar) alone against plain blocks, balanced: the value of x is revealed. */
export function solvedValue(scale: ScaleState): number | null {
  if (!isBalanced(scale)) return null;
  for (const [one, other] of [
    [scale.L, scale.R],
    [scale.R, scale.L],
  ] as const) {
    if (one.length === 1 && isUnknown(one[0].kind) && other.length > 0 && other.every((it) => isBlock(it.kind))) {
      return panTotal(other, scale.x);
    }
  }
  return null;
}

export type Verdict = 'identity' | 'contradiction' | 'needs_reduction';

/** Rigged-scale bonus: once no unknowns are left, the last statement tells how many solutions there are. */
export function classify(scale: ScaleState): Verdict {
  const anyUnknown = [...scale.L, ...scale.R].some((it) => isUnknown(it.kind));
  if (anyUnknown) return 'needs_reduction';
  return panTotal(scale.L, 0) === panTotal(scale.R, 0) ? 'identity' : 'contradiction';
}

export function seesawLoad(state: StallState): number {
  return panTotal(state.seesaw, 0);
}

export type LaunchOutcome = 'short' | 'perfect' | 'long';

export function launchOutcome(load: number, target: number): LaunchOutcome {
  return load === target ? 'perfect' : load < target ? 'short' : 'long';
}

function sideTerms(items: Item[]): string {
  const unknowns = items.filter((it) => isUnknown(it.kind)).length;
  const blocks = items.filter((it) => isBlock(it.kind) || it.kind === 'bundle').reduce((a, it) => a + itemValue(it, 0), 0);
  const balloons = items.filter((it) => it.kind === 'balloon').length;
  const pairs = items.filter((it) => it.kind === 'pair').length;
  const terms: string[] = [];
  if (unknowns) terms.push(unknowns === 1 ? 'x' : `${unknowns}x`);
  if (blocks) terms.push(terms.length ? `+ ${blocks}` : `${blocks}`);
  for (let i = 0; i < pairs; i++) terms.push(terms.length ? '+ (1 − 1)' : '(1 − 1)');
  if (balloons) terms.push(terms.length ? `− ${balloons}` : `−${balloons}`);
  return terms.length ? terms.join(' ') : '0';
}

/** The chalk tag, e.g. "3x + 2 = x + 8". Always written left-to-right. */
export function equationString(scale: ScaleState): string {
  return `${sideTerms(scale.L)} = ${sideTerms(scale.R)}`;
}

function countKinds(items: Item[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    if (it.kind === 'bundle') {
      for (const p of it.parts ?? []) out[`w${p}`] = (out[`w${p}`] ?? 0) + 1;
    } else out[it.kind] = (out[it.kind] ?? 0) + 1;
  }
  return out;
}

export interface PanChange {
  side: Side;
  kind: Kind;
  delta: number;
}

/** What changed on each pan since the last balanced snapshot (for the "what tipped" message). */
export function panChanges(before: ScaleState, after: ScaleState): PanChange[] {
  const out: PanChange[] = [];
  for (const side of ['L', 'R'] as Side[]) {
    const a = countKinds(before[side]);
    const b = countKinds(after[side]);
    for (const kind of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const delta = (b[kind] ?? 0) - (a[kind] ?? 0);
      if (delta) out.push({ side, kind: kind as Kind, delta });
    }
  }
  return out;
}

export function itemsSummary(items: Item[]): Record<string, number> {
  return countKinds(items);
}
