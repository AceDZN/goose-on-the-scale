import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STALLS, vendorConfig } from '../src/levels.ts';
import {
  AFTER_DISTRACT_AWAY,
  honkDistracts,
  honkVendor,
  initVendor,
  shoo,
  tickVendor,
  watchesScale,
  type VendorState,
} from '../src/vendor.ts';

const melon = vendorConfig(STALLS[0], 0);

function run(v: VendorState, cfg = melon, seconds: number, step = 0.05) {
  const modes: string[] = [];
  for (let t = 0; t < seconds; t += step) {
    v = tickVendor(v, cfg, step);
    if (modes[modes.length - 1] !== v.mode) modes.push(v.mode);
  }
  return { v, modes };
}

test('attention cycle is away → warning → looking → away, with a readable warning', () => {
  let v = initVendor(melon);
  assert.equal(v.mode, 'away');
  assert.ok(melon.warn >= 1.2, 'warning lasts at least 1.2 s');
  const { modes } = run(v, melon, 30);
  assert.deepEqual(modes.slice(0, 4), ['away', 'warning', 'looking', 'away']);
  v = tickVendor(initVendor(melon), melon, melon.away[0] + 0.01);
  assert.equal(v.mode, 'warning');
  assert.equal(watchesScale(v), false, 'the warning never catches you');
});

test('every stall leaves away windows long enough for a safe pair of moves', () => {
  for (const def of STALLS.filter((d) => !d.bonus)) {
    for (let i = 0; i < def.vendors.length; i++) {
      const cfg = vendorConfig(def, i);
      assert.ok(Math.min(...cfg.away) >= 4, `${def.id} vendor ${i} away ≥ 4 s`);
      assert.ok(cfg.look <= 3, `${def.id} looks ≤ 3 s`);
    }
  }
});

test('a honk from behind the vendor pulls their eyes off the scale', () => {
  const dx = melon.scalePos.x - melon.pos.x;
  const dz = melon.scalePos.z - melon.pos.z;
  const l = Math.hypot(dx, dz);
  const behind = { x: melon.pos.x - (dx / l) * 1.5 + 0.4, z: melon.pos.z - (dz / l) * 1.5 };
  assert.ok(honkDistracts(melon, behind));
  const looking: VendorState = { mode: 'looking', t: 2, idx: 0 };
  const r = honkVendor(looking, melon, behind);
  assert.equal(r.effect, 'distracted');
  assert.equal(watchesScale(r.state), false);
  const later = tickVendor(r.state, melon, melon.distract + 0.01);
  assert.equal(later.mode, 'away');
  assert.ok(later.t <= AFTER_DISTRACT_AWAY);
});

test('a honk from the scale side makes the vendor turn toward the goose — and the scale', () => {
  const front = { x: melon.scalePos.x + 0.5, z: melon.scalePos.z + 1.5 };
  assert.equal(honkDistracts(melon, front), false);
  const r = honkVendor(initVendor(melon), melon, front);
  assert.equal(r.effect, 'noticed');
  assert.equal(r.state.mode, 'warning');
});

test('two vendors with offset cycles still share moments where both are away', () => {
  const def = STALLS.find((d) => d.id === 'two-vendors')!;
  const cfgs = [vendorConfig(def, 0), vendorConfig(def, 1)];
  let vs = cfgs.map(initVendor);
  let both = 0;
  let best = 0;
  for (let t = 0; t < 60; t += 0.05) {
    vs = vs.map((v, i) => tickVendor(v, cfgs[i], 0.05));
    if (vs.every((v) => v.mode === 'away')) both += 0.05;
    else both = 0;
    best = Math.max(best, both);
  }
  assert.ok(best >= 2.5, `longest shared window ${best.toFixed(2)} s`);
});

test('asleep vendors (bonus) never watch; shooing ends back at work', () => {
  const def = STALLS.find((d) => d.id === 'rigged')!;
  const cfg = vendorConfig(def, 0);
  const { modes } = run(initVendor(cfg), cfg, 60);
  assert.deepEqual(modes, ['asleep']);
  const s = tickVendor(shoo({ mode: 'looking', t: 1, idx: 0 }), melon, 3);
  assert.equal(s.mode, 'away');
});
