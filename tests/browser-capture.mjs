// Real-browser smoke run + screenshots. Needs the dev server on :5179 (npm run dev).
// Usage: node tests/browser-capture.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const base = 'http://localhost:5179/?test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];

async function page(viewport, query = '') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: query.includes('touch') });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(base + query);
  await p.waitForFunction(() => window.__game && window.__game());
  await p.waitForTimeout(800);
  return p;
}

const shot = (p, name) => p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 82 });
const run = (p, fn, arg) => p.evaluate(fn, arg);

// 1. title
let p = await page({ width: 1600, height: 900 });
await p.evaluate(() => window.advanceTime(1500));
await shot(p, '01-title');

// 2. stall 1 near the scale, chalk tag on
await run(p, () => {
  window.__debug.start(0);
  window.__game().dismissMessage();
  window.__debug.move(0.25, -1, 500);
  window.advanceTime(1200);
});
await shot(p, '02-stall1-gameplay');

// 3. caught: take 1 kg from the left pan only and wait for the vendor
const caught = await run(p, () => {
  const g = window.__game();
  const at = (x, z, yaw) => Object.assign(g.goose, { x, z, yaw });
  at(-1.55, 0.6, Math.PI);
  const it = g.stall.scales[0].L.find((i) => i.kind === 'w1');
  g.clickItem(it.id);
  window.advanceTime(50);
  at(-1.1, 2.4, 0.4);
  window.__debug.act('interact');
  for (let n = 0; n < 400 && g.caught === 0; n++) window.advanceTime(50);
  window.advanceTime(400);
  return JSON.parse(window.render_game_to_text()).lastOutcome;
});
await shot(p, '03-caught');

// 4. solve stall 1 and stand on the seesaw
await run(p, () => window.__debug.autosolve(0));
await run(p, () => {
  const g = window.__game();
  g.dismissMessage();
  const at = (x, z, yaw) => Object.assign(g.goose, { x, z, yaw });
  for (let k = 0; k < 10 && g.stall.seesaw.reduce((a, i) => a + Number(i.kind.slice(1)), 0) < 8; k++) {
    const it = g.stall.ground.find((i) => i.kind === 'w2') ?? g.stall.ground.find((i) => i.kind.startsWith('w'));
    if (!it) break;
    at(it.pos.x, it.pos.z, 0);
    g.clickItem(it.id);
    window.advanceTime(30);
    at(5.8, 3.2, Math.PI / 2);
    window.__debug.act('interact');
    window.advanceTime(30);
  }
  at(4.2, 3.2, Math.PI / 2);
  window.advanceTime(1200);
});
await shot(p, '04-seesaw');
const launch = await run(p, () => {
  window.__debug.act('interact');
  window.advanceTime(900);
  return JSON.parse(window.render_game_to_text()).goose;
});
await shot(p, '05-launch');

// 6. other stalls
for (const [i, name] of [
  [1, '06-stall2-change-share'],
  [4, '07-stall5-balloons'],
  [5, '08-stall6-two-vendors'],
  [6, '09-stall7-jars'],
  [7, '10-bonus'],
]) {
  await run(p, (i) => {
    window.__debug.start(i);
    window.__game().dismissMessage();
    window.__debug.move(0.2, -1, 450);
    window.advanceTime(1500);
  }, i);
  await shot(p, name);
}
const autos = await run(p, () => [0, 1, 2, 3, 4, 5].map((i) => window.__debug.autosolve(i)));
await p.close();

// 7. phone landscape, touch layout
p = await page({ width: 844, height: 390 }, '&touch');
await run(p, () => {
  window.__debug.start(0);
  window.__game().dismissMessage();
  window.__debug.move(-0.5, -1, 600);
  window.advanceTime(1200);
});
await shot(p, '11-phone-landscape');
await p.close();

await browser.close();
console.log(JSON.stringify({ caught, launch, autos, errors }, null, 1));
