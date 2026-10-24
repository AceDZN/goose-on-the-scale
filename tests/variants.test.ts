import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEEDS_CHANGE, NEEDS_SHARE, STALLS, buildStall, variantsFor } from '../src/levels.ts';
import {
  change,
  classify,
  dropOnGround,
  dropOnPan,
  equationString,
  grab,
  isBalanced,
  panTotal,
  share,
  solvedValue,
  type Result,
  type StallState,
} from '../src/rules.ts';
import { solve } from '../src/solver.ts';
import { Game } from '../src/game.ts';

const playable = STALLS.filter((d) => !d.bonus);

/** Replay a solver move list with the rules module; returns the final state and the worst unbalanced streak. */
function replay(start: StallState, moves: string[]) {
  let s = start;
  let streak = 0;
  let worst = 0;
  for (const mv of moves) {
    const [verb, a, b] = mv.split(' ');
    let r: Result;
    if (verb === 'grab') {
      const list = b === 'supply' ? s.supply : s.scales[0][b as 'L' | 'R'];
      const it = list.find((i) => i.kind === a);
      assert.ok(it, `${mv}: nothing to grab`);
      r = grab(s, b === 'supply' ? { at: 'supply' } : { at: 'pan', scale: 0, side: b as 'L' | 'R' }, it.id);
    } else if (verb === 'drop') r = a === 'ground' ? dropOnGround(s) : dropOnPan(s, 0, a as 'L' | 'R');
    else if (verb === 'change') r = change(s);
    else r = share(s, 0, Number(a));
    assert.ok(r.ok, `${mv}: ${!r.ok && r.reason}`);
    s = r.state;
    streak = isBalanced(s.scales[0]) ? 0 : streak + 1;
    worst = Math.max(worst, streak);
  }
  return { s, worst };
}

test('every stall offers 5 exercises with distinct equations', () => {
  for (const def of STALLS) {
    const vs = variantsFor(def);
    assert.equal(vs.length, 5, def.id);
    const eqs = vs.map((v) => buildStall(def, v).scales.map(equationString).join(' | '));
    assert.equal(new Set(eqs).size, 5, `${def.id}: ${eqs.join(' / ')}`);
  }
});

test('each exercise is balanced only at its own x and fits on the pans', () => {
  for (const def of playable) {
    for (const v of variantsFor(def)) {
      const sc = buildStall(def, v).scales[0];
      assert.ok(sc.L.length <= 9 && sc.R.length <= 9, `${def.id}: too many items`);
      for (let x = 0; x <= 25; x++) {
        assert.equal(panTotal(sc.L, x) === panTotal(sc.R, x), x === v.scales[0].x, `${def.id} ${equationString(sc)} x=${x}`);
      }
    }
  }
});

test('each generated exercise replays its stored safe solution to the right x', () => {
  for (const def of playable) {
    for (const v of variantsFor(def).slice(1)) {
      const { s, worst } = replay(buildStall(def, v), v.moves);
      assert.equal(solvedValue(s.scales[0]), v.scales[0].x, `${def.id} ${equationString(buildStall(def, v).scales[0])}`);
      assert.ok(worst <= 2, `${def.id}: unbalanced for ${worst} actions in a row`);
    }
  }
});

test('the tool a stall teaches is still needed in every exercise', () => {
  for (const def of playable) {
    for (const v of variantsFor(def)) {
      const opts = { maxStreak: 2, maxDepth: 40, changeBox: def.changeBox, shareBoard: def.shareBoard };
      const eq = equationString(buildStall(def, v).scales[0]);
      if (NEEDS_CHANGE.includes(def.id)) assert.equal(solve(buildStall(def, v), { ...opts, changeBox: false }), null, `${def.id} ${eq} solvable without change box`);
      if (NEEDS_SHARE.includes(def.id)) assert.equal(solve(buildStall(def, v), { ...opts, shareBoard: false }), null, `${def.id} ${eq} solvable without share board`);
    }
  }
});

test('every exercise has enough block weight to load the seesaw with n·x', () => {
  for (const def of playable) {
    for (const v of variantsFor(def)) {
      const s = buildStall(def, v);
      const blocks = [...s.scales[0].L, ...s.scales[0].R, ...s.supply].filter((i) => i.kind.startsWith('w'));
      assert.ok(panTotal(blocks, 0) >= def.seesawN! * v.scales[0].x, `${def.id} x=${v.scales[0].x}`);
    }
  }
});

test('bonus exercises always hold exactly one rigged-forever and one never-balancing scale', () => {
  const def = STALLS.find((d) => d.bonus)!;
  for (const v of variantsFor(def)) {
    const s = buildStall(def, v);
    const verdicts = s.scales.map((sc) => {
      const reduced = { ...sc, L: sc.L.filter((i) => i.kind !== 'sack'), R: sc.R.filter((i) => i.kind !== 'sack') };
      return classify(reduced);
    });
    assert.deepEqual([...verdicts].sort(), ['contradiction', 'identity']);
  }
});

test('loading a stall never repeats the exercise just played; restart keeps it; new exercise changes it', () => {
  const g = new Game(0);
  let seq = 0;
  const rolls = [0.1, 0.1, 0.1, 0.9, 0.5];
  g.random = () => rolls[seq++ % rolls.length];
  for (let i = 0; i < 20; i++) {
    const before = g.exercise;
    g.loadStall(0);
    assert.notEqual(g.exercise, before);
    g.restartStall();
    assert.equal(g.exercise, g.lastExercise.melon);
    const kept = g.exercise;
    g.newExercise();
    assert.notEqual(g.exercise, kept);
  }
  g.loadStall(2, 3);
  assert.equal(g.exercise, 3);
  assert.equal(g.exerciseCount, 5);
});
