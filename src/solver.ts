// Breadth-first search over goose actions, used by the tests (and the debug overlay)
// to prove that every authored stall can be solved while the scale is never left
// unbalanced for more than `maxStreak` actions in a row. Items on the floor are
// never picked back up, and only supply blocks and change bundles are dropped onto
// a pan. That removes detours and keeps the search small; any solution found is
// still a real sequence of game actions.
import {
  change,
  dropOnGround,
  dropOnPan,
  grab,
  isBalanced,
  share,
  solvedValue,
  type Item,
  type Loc,
  type Result,
  type StallState,
} from './rules.ts';

export interface SolveOptions {
  scale?: number;
  maxStreak: number;
  maxDepth: number;
  changeBox: boolean;
  shareBoard: boolean;
}

export interface Solution {
  moves: string[];
  maxStreakUsed: number;
}

const kindKey = (it: Item) => (it.kind === 'bundle' ? `b${(it.parts ?? []).join('')}` : it.kind);
const bag = (items: Item[]) => items.map(kindKey).sort().join(',');

function key(s: StallState, streak: number): string {
  const sc = s.scales.map((x) => `${bag(x.L)}|${bag(x.R)}`).join('/');
  return `${sc}#${bag(s.supply)}#${s.beak ? kindKey(s.beak) : '-'}#${streak}`;
}

function distinct(items: Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const k = kindKey(it);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function solve(start: StallState, opts: SolveOptions): Solution | null {
  const si = opts.scale ?? 0;
  type Node = { s: StallState; streak: number; depth: number; worst: number; parent: number; move: string };
  const queue: Node[] = [{ s: start, streak: 0, depth: 0, worst: 0, parent: -1, move: '' }];
  const path = (i: number) => {
    const out: string[] = [];
    for (let j = i; j > 0; j = queue[j].parent) out.unshift(queue[j].move);
    return out;
  };
  const seen = new Set([key(start, 0)]);
  const supplyIds = new Set(start.supply.map((it) => it.id));
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head];
    if (solvedValue(n.s.scales[si]) !== null) return { moves: path(head), maxStreakUsed: n.worst };
    if (n.depth >= opts.maxDepth) continue;
    const tries: [string, Result][] = [];
    if (!n.s.beak) {
      const locs: [string, Loc][] = [
        ['L', { at: 'pan', scale: si, side: 'L' }],
        ['R', { at: 'pan', scale: si, side: 'R' }],
        ['supply', { at: 'supply' }],
      ];
      for (const [name, loc] of locs) {
        const list = loc.at === 'pan' ? n.s.scales[si][loc.side] : n.s.supply;
        for (const it of distinct(list)) tries.push([`grab ${kindKey(it)} ${name}`, grab(n.s, loc, it.id)]);
      }
      if (opts.shareBoard) for (let k = 2; k <= 5; k++) tries.push([`share ${k}`, share(n.s, si, k)]);
    } else {
      if (n.s.beak.kind === 'bundle' || supplyIds.has(n.s.beak.id)) {
        tries.push(['drop L', dropOnPan(n.s, si, 'L')]);
        tries.push(['drop R', dropOnPan(n.s, si, 'R')]);
      }
      tries.push(['drop ground', dropOnGround(n.s)]);
      if (opts.changeBox) tries.push(['change', change(n.s)]);
    }
    for (const [label, r] of tries) {
      if (!r.ok) continue;
      const bal = isBalanced(r.state.scales[si]);
      const streak = bal ? 0 : n.streak + 1;
      if (streak > opts.maxStreak) continue;
      const k = key(r.state, streak);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ s: r.state, streak, depth: n.depth + 1, worst: Math.max(n.worst, streak), parent: head, move: label });
    }
  }
  return null;
}
