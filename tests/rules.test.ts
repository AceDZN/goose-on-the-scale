import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  change,
  classify,
  difference,
  dropOnGround,
  dropOnPan,
  dropOnSeesaw,
  equationString,
  grab,
  isBalanced,
  launchOutcome,
  panChanges,
  panTotal,
  partition,
  seesawLoad,
  share,
  solvedValue,
  type StallState,
} from '../src/rules.ts';
import { STALLS, buildStall } from '../src/levels.ts';
import { solve } from '../src/solver.ts';

const stall = (id: string) => STALLS.find((s) => s.id === id)!;
const L = { at: 'pan', scale: 0, side: 'L' } as const;
const R = { at: 'pan', scale: 0, side: 'R' } as const;

function ok(r: ReturnType<typeof grab>): StallState {
  assert.ok(r.ok, `expected ok, got ${!r.ok && r.reason}`);
  return r.state;
}

function grabKind(s: StallState, loc: typeof L | typeof R, kind: string): StallState {
  const it = s.scales[0][loc.side].find((i) => i.kind === kind);
  assert.ok(it, `no ${kind} on ${loc.side}`);
  return ok(grab(s, loc, it.id));
}

test('every stall starts balanced at its hidden x and matches its equation', () => {
  const expected: Record<string, string[]> = {
    melon: ['x + 3 = 7'],
    'two-sacks': ['2x + 1 = 9'],
    'both-pans': ['3x + 2 = x + 8'],
    'change-box': ['2x + 5 = 17'],
    balloons: ['3x − 2 = x + 6'],
    'two-vendors': ['4x + 3 = 2x + 15'],
    spice: ['5x − 4 = 2x + 11'],
    rigged: ['x + 2 = x + 2', 'x + 3 = x + 5'],
  };
  for (const def of STALLS) {
    const s = buildStall(def);
    assert.deepEqual(s.scales.map(equationString), expected[def.id], def.id);
    if (!def.bonus) assert.ok(isBalanced(s.scales[0]), `${def.id} starts balanced`);
  }
});

test('the hidden x is the only value that balances each authored scale', () => {
  for (const def of STALLS.filter((d) => !d.bonus)) {
    const s = buildStall(def).scales[0];
    for (let x = 0; x <= 20; x++) {
      const bal = panTotal(s.L, x) === panTotal(s.R, x);
      assert.equal(bal, x === def.scales[0].x, `${def.id} x=${x}`);
    }
  }
});

// One equivalent operation takes at most two unbalanced actions: grab, drop, grab the match
// (or grab, change, drop back). A "safe" solution never needs more than that.
const SAFE = 2;

test('every stall has a safe solution (never more than 2 unbalanced actions in a row) with a stable par', () => {
  const par: Record<string, number> = {};
  for (const def of STALLS.filter((d) => !d.bonus)) {
    const sol = solve(buildStall(def), { maxStreak: SAFE, maxDepth: 40, changeBox: def.changeBox, shareBoard: def.shareBoard });
    assert.ok(sol, `${def.id} solvable`);
    par[def.id] = sol.moves.length;
  }
  assert.deepEqual(par, { melon: 7, 'two-sacks': 8, 'both-pans': 9, 'change-box': 8, balloons: 13, 'two-vendors': 12, spice: 27 });
});

test('stalls that teach a tool cannot be solved safely without it', () => {
  for (const id of ['two-sacks', 'change-box']) {
    const def = stall(id);
    assert.equal(solve(buildStall(def), { maxStreak: SAFE, maxDepth: 40, changeBox: false, shareBoard: true }), null, `${id} needs the change box`);
  }
  for (const id of ['two-sacks', 'both-pans', 'change-box', 'balloons', 'two-vendors']) {
    const def = stall(id);
    assert.equal(solve(buildStall(def), { maxStreak: SAFE, maxDepth: 40, changeBox: true, shareBoard: false }), null, `${id} needs the share board`);
  }
});

test('melon stall: removing 2 kg from one pan only tips it and names what changed', () => {
  const start = buildStall(stall('melon'));
  const s = ok(dropOnGround(grabKind(start, L, 'w2')));
  assert.equal(difference(s.scales[0]), -2);
  assert.deepEqual(panChanges(start.scales[0], s.scales[0]), [{ side: 'L', kind: 'w2', delta: -1 }]);
  const s2 = ok(dropOnGround(grabKind(s, R, 'w2')));
  assert.ok(isBalanced(s2.scales[0]));
});

test('holding an item in the beak counts as off the scale', () => {
  const s = grabKind(buildStall(stall('melon')), L, 'sack');
  assert.equal(difference(s.scales[0]), -4);
  assert.equal(s.beak?.kind, 'sack');
});

test('change box keeps value: 10→5+5, 5→2+2+1, 2→1+1, 1 cannot change', () => {
  const s = buildStall(stall('change-box'));
  const held = grabKind(s, R, 'w10');
  const c = ok(change(held));
  assert.deepEqual(c.beak?.parts, [5, 5]);
  const back = ok(dropOnPan(c, 0, 'R'));
  assert.ok(isBalanced(back.scales[0]));
  assert.equal(back.scales[0].R.filter((i) => i.kind === 'w5').length, 3, 'the original 5 plus two from the change');
  const one = grabKind(s, R, 'w1');
  assert.equal(change(one).ok, false);
});

test('share board refuses a 5 kg block that is too big for groups of 4, and explains why', () => {
  const def = stall('two-sacks');
  let s = buildStall(def);
  s = ok(dropOnPan(ok(change(grabKind(s, R, 'w2'))), 0, 'R'));
  s = ok(dropOnGround(grabKind(s, L, 'w1')));
  s = ok(dropOnGround(grabKind(s, R, 'w1')));
  assert.ok(isBalanced(s.scales[0]));
  const r = share(s, 0, 2);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'share_blocks_R');
  s = ok(dropOnPan(ok(change(grabKind(s, R, 'w5'))), 0, 'R'));
  const shared = ok(share(s, 0, 2));
  assert.equal(solvedValue(shared.scales[0]), 4);
});

test('balloons are −1: a 1 kg block dropped next to one ties a zero pair', () => {
  const def = stall('balloons');
  const s = buildStall(def);
  const supplyOne = s.supply[0];
  const held = ok(grab(s, { at: 'supply' }, supplyOne.id));
  const r = dropOnPan(held, 0, 'L');
  assert.ok(r.ok && r.event === 'zero_pair');
  assert.equal(difference(r.state.scales[0]), 1);
  assert.equal(r.state.scales[0].L.filter((i) => i.kind === 'pair').length, 1);
  assert.match(equationString(r.state.scales[0]), /\(1 − 1\)/);
});

test('balloons: removing a balloon makes that pan heavier (the classic sign mistake)', () => {
  const s = buildStall(stall('balloons'));
  const noBalloon = ok(dropOnGround(grabKind(s, L, 'balloon')));
  assert.equal(noBalloon.sky.length, 1, 'a loose balloon floats away');
  assert.equal(difference(noBalloon.scales[0]), 1);
  const wrong = ok(dropOnGround(grabKind(noBalloon, R, 'w1')));
  assert.equal(difference(wrong.scales[0]), 2, 'left heavier by 2, not balanced');
});

test('share needs equal sack counts per group and no loose balloons', () => {
  const s = buildStall(stall('balloons'));
  const r = share(s, 0, 2);
  assert.equal(!r.ok && r.reason, 'share_balloons_L');
  const m = buildStall(stall('melon'));
  assert.equal(!share(m, 0, 2).ok && (share(m, 0, 2) as { reason: string }).reason, 'share_sacks_L');
});

test('partition finds equal groups or proves none exist', () => {
  assert.ok(partition([2, 2, 1, 2, 1], 2));
  assert.equal(partition([5, 2, 1], 2), null);
  assert.ok(partition([5, 5, 1, 1, 1, 1, 1], 3));
  assert.equal(partition([10, 1, 1, 1, 1, 1], 3), null);
});

test('solvedValue needs one unknown alone against plain blocks', () => {
  const s = buildStall(stall('melon'));
  assert.equal(solvedValue(s.scales[0]), null);
  let t = ok(dropOnGround(grabKind(s, L, 'w2')));
  t = ok(dropOnGround(grabKind(t, R, 'w2')));
  t = ok(dropOnGround(grabKind(t, L, 'w1')));
  t = ok(dropOnGround(grabKind(t, R, 'w1')));
  assert.equal(solvedValue(t.scales[0]), 4);
});

test('rigged scales: identity versus contradiction after removing a sack from each pan', () => {
  const s = buildStall(stall('rigged'));
  assert.equal(classify(s.scales[0]), 'needs_reduction');
  for (const i of [0, 1]) {
    const a = s.scales[i];
    for (const x of [0, 1, 3, 7, 50]) {
      const d = panTotal(a.L, x) - panTotal(a.R, x);
      if (i === 0) assert.equal(d, 0, 'always balanced');
      else assert.notEqual(d, 0, 'never balanced');
    }
  }
  const reduce = (i: number) => {
    let t = s;
    const lsack = t.scales[i].L.find((it) => it.kind === 'sack')!;
    t = ok(dropOnGround(ok(grab(t, { at: 'pan', scale: i, side: 'L' }, lsack.id))));
    const rsack = t.scales[i].R.find((it) => it.kind === 'sack')!;
    t = ok(dropOnGround(ok(grab(t, { at: 'pan', scale: i, side: 'R' }, rsack.id))));
    return t.scales[i];
  };
  assert.equal(classify(reduce(0)), 'identity');
  assert.equal(classify(reduce(1)), 'contradiction');
});

test('seesaw: only blocks load, launch needs exactly n·x', () => {
  const s = buildStall(stall('melon'));
  const held = grabKind(s, L, 'sack');
  assert.equal(dropOnSeesaw(held).ok, false);
  let t = ok(dropOnSeesaw(grabKind(s, R, 'w2')));
  t = ok(dropOnSeesaw(ok(grab(t, R, t.scales[0].R.find((i) => i.kind === 'w2')!.id))));
  assert.equal(seesawLoad(t), 4);
  assert.equal(launchOutcome(4, 8), 'short');
  assert.equal(launchOutcome(8, 8), 'perfect');
  assert.equal(launchOutcome(9, 8), 'long');
});

test('each stall has enough block weight lying around to load the seesaw with n·x', () => {
  for (const def of STALLS.filter((d) => d.seesawN)) {
    const s = buildStall(def);
    const blocks = [...s.scales[0].L, ...s.scales[0].R, ...s.supply].filter((i) => i.kind.startsWith('w'));
    assert.ok(panTotal(blocks, 0) >= def.seesawN! * def.scales[0].x, def.id);
  }
});
