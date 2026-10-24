import '@fontsource/rubik/hebrew-400.css';
import '@fontsource/rubik/hebrew-600.css';
import '@fontsource/rubik/hebrew-800.css';
import '@fontsource/rubik/hebrew-900.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-800.css';
import './style.css';
import * as THREE from 'three';
import { Game, STALLS, kindName, type GameEvent } from './game.ts';
import { View } from './view.ts';
import { Input } from './input.ts';
import { loadModels } from './models.ts';
import { initAudio, isMuted, setMuted, sfx } from './audio.ts';
import { seesawLoad } from './rules.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const STEP = 1 / 60;
const PROGRESS_KEY = 'goose-scale-progress-v1';
const LOG_KEY = 'goose-scale-log-v1';
const SETTINGS_KEY = 'goose-scale-settings-v1';

interface Progress {
  stars: Record<string, number>;
  unlocked: number;
  feathers: number;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable: progress lives in memory only */
  }
}

const params = new URLSearchParams(location.search);
const progress: Progress = readJSON(PROGRESS_KEY, { stars: {}, unlocked: 1, feathers: 0 });
if (params.has('all')) progress.unlocked = STALLS.length;
const settings = readJSON(SETTINGS_KEY, { muted: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });

// ------------------------------------------------------------------ renderer

const canvas = $<HTMLCanvasElement>('game');
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
} catch {
  $('glerror').classList.remove('hidden');
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  $('glerror').classList.remove('hidden');
  paused = true;
});

const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
if (isTouch) document.body.classList.add('touch');

// ------------------------------------------------------------------ boot

let game: Game;
let view: View;
let input: Input;
let paused = false;
let started = false;
let fps = 0;

async function boot() {
  await document.fonts.load('800 32px Rubik').catch(() => undefined);
  const models = await loadModels((d, t) => ($('loading').textContent = `טוען את השוק… ${d}/${t}`));
  $('loading').classList.add('hidden');
  game = new Game(Number(params.get('stall') ?? 1) - 1 || 0);
  game.onLog = (e) => {
    const log = readJSON<unknown[]>(LOG_KEY, []);
    log.push(e);
    writeJSON(LOG_KEY, log.slice(-600));
  };
  view = new View(models, innerWidth / innerHeight, renderer);
  view.reducedMotion = settings.reducedMotion;
  view.onStep = () => started && sfx.step();
  view.loadStall(game);
  input = new Input(canvas);
  input.bindJoystick($('joy'), $('knob'));
  input.bindButton($('t-act'), 'interact');
  input.bindButton($('t-flap'), 'flap');
  input.bindButton($('btn-honk'), 'honk');
  wireUi();
  setMuted(settings.muted);
  syncSoundButtons();
  resize();
  renderMedals();
  (window as unknown as { __models: unknown }).__models = {
    goose: !!models.goose,
    vendor: !!models.vendor,
    vendorClips: models.vendorClips.map((c) => c.name),
    gooseClips: models.gooseClips.map((c) => c.name),
    sack: !!models.sack,
    jar: !!models.jar,
  };
  if (params.has('autostart')) startGame(game.stallIndex);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ loop

let last = performance.now();
let acc = 0;
let frames = 0;
let fpsT = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frames++;
  fpsT += dt;
  if (fpsT >= 1) {
    fps = frames / fpsT;
    frames = 0;
    fpsT = 0;
  }
  if (!manualTime) {
    acc += dt;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
  }
  render();
  requestAnimationFrame(frame);
}

let manualTime = false;

function step(dt: number) {
  if (!started || paused) {
    view.update(game, dt);
    return;
  }
  for (const a of input.drain()) handleAction(a);
  const yaw = input.takeYaw();
  if (!isTouch || yaw) view.camYaw = Math.max(-0.9, Math.min(0.9, view.camYaw + yaw));
  const m = input.move();
  const cy = view.camYaw;
  const move = { x: m.x * Math.cos(cy) - m.y * Math.sin(cy), z: -m.x * Math.sin(cy) - m.y * Math.cos(cy) };
  const before = game.stallIndex;
  game.update(dt, move);
  const events = game.events.splice(0);
  if (events.length) onEvents(events);
  view.handleEvents(game, events);
  view.update(game, dt);
  if (game.stallIndex !== before) view.loadStall(game);
}

function render() {
  renderer.render(view.scene, view.camera);
  updateHud();
}

function handleAction(a: string) {
  initAudio();
  switch (a) {
    case 'interact':
      game.interact();
      if (game.phase === 'bonusDone' && !game.message) showFinale();
      break;
    case 'honk':
      game.honk();
      break;
    case 'flap':
      if (game.message && game.message.ttl === undefined) game.dismissMessage();
      else game.flap();
      break;
    case 'pause':
      togglePause();
      break;
    case 'hint':
      toggleHint();
      break;
    case 'mute':
      toggleMute();
      break;
    case 'restart':
      game.restartStall();
      break;
  }
}

// ------------------------------------------------------------------ events → sound + progress

function onEvents(events: GameEvent[]) {
  for (const e of events) {
    switch (e.type) {
      case 'honk':
        sfx.honk();
        break;
      case 'action':
        if (e.event === 'grab' || e.event === 'balloon_lift') sfx.grab();
        else if (e.event === 'zero_pair') sfx.pop();
        else if (e.event === 'changed') sfx.change();
        else if (e.event === 'balloon_away') sfx.pop();
        else sfx.drop();
        break;
      case 'tipped':
        sfx.clank();
        break;
      case 'balanced':
        sfx.balance();
        break;
      case 'vendorMode':
        if (e.mode === 'warning') sfx.warn();
        if (e.mode === 'away' && e.from === 'looking') sfx.hum();
        break;
      case 'caught':
        sfx.caught();
        break;
      case 'share':
        sfx.share();
        break;
      case 'shareFail':
      case 'stampWrong':
        sfx.boing();
        break;
      case 'solved':
        sfx.solved();
        break;
      case 'launch':
        sfx.whoosh();
        break;
      case 'splat':
        sfx.splat();
        break;
      case 'bonk':
        sfx.boing();
        break;
      case 'stallDone':
        sfx.solved();
        saveProgress();
        showStallDone(e.stars as number);
        break;
      case 'stampRight':
        sfx.feather();
        break;
      case 'bonusDone':
        progress.feathers = Math.max(progress.feathers, game.feathers);
        saveProgress();
        break;
      case 'flap':
        sfx.step();
        break;
      case 'nothing':
        break;
    }
  }
}

function saveProgress() {
  for (const [k, v] of Object.entries(game.stars)) progress.stars[k] = Math.max(progress.stars[k] ?? 0, v);
  progress.unlocked = Math.max(progress.unlocked, Math.min(STALLS.length, game.stallIndex + 2));
  writeJSON(PROGRESS_KEY, progress);
  renderMedals();
}

// ------------------------------------------------------------------ HUD

const MODE_LABEL: Record<string, string> = {
  away: 'המוכר עסוק',
  warning: 'המוכר מסתובב…',
  looking: 'רואה אותך!',
  distracted: 'מוסח! מסתכל לצד',
  shooing: 'קישטה!',
  happy: 'המוכר מרוצה',
  asleep: 'המוכר נמנם',
};
const EYE_SVG = `<svg viewBox="0 0 32 32"><path d="M2 16C6 9 11 6 16 6s10 3 14 10c-4 7-9 10-14 10S6 23 2 16z" fill="#fff"/><circle cx="16" cy="16" r="6" fill="#1f5a55"/><circle cx="16" cy="16" r="2.6" fill="#0d1f1d"/></svg>`;

let meterCount = -1;
function updateHud() {
  if (!game || !started) return;
  const meters = $('meters');
  if (meterCount !== game.vendors.length) {
    meterCount = game.vendors.length;
    meters.innerHTML = game.vendors.map((_, i) => `<div class="meter" id="meter-${i}"><div class="eye">${EYE_SVG}</div><div class="tag"><div class="label"></div><div class="bar"><div class="fill"></div></div></div></div>`).join('');
    meters.classList.toggle('meters-2', meterCount > 1);
  }
  game.vendors.forEach((v, i) => {
    const el = $(`meter-${i}`);
    if (!el) return;
    el.dataset.mode = v.mode;
    const cfg = game.vcfgs[i];
    const label = el.querySelector('.label') as HTMLElement;
    const text = game.vendors.length > 1 ? `${i === 0 ? 'ימני' : 'שמאלי'}: ${MODE_LABEL[v.mode]}`.replace('ימני', 'מוכר 1').replace('שמאלי', 'מוכר 2') : MODE_LABEL[v.mode];
    if (label.textContent !== text) label.textContent = text;
    let frac = 1;
    if (v.mode === 'away') frac = Math.min(1, v.t / Math.max(...cfg.away));
    else if (v.mode === 'warning') frac = v.t / cfg.warn;
    else if (v.mode === 'distracted') frac = v.t / cfg.distract;
    (el.querySelector('.fill') as HTMLElement).style.width = `${Math.max(0, frac) * 100}%`;
  });

  $('stall-title').textContent = `דוכן ${game.def.num} • ${game.def.title}`;
  const starEls = $('stars').children;
  const solved = game.solvedX !== null || game.phase === 'stallDone';
  const earned = game.stars[game.def.id] ?? 0;
  const states = [
    solved || earned >= 1 ? 'on' : '',
    game.caught > 0 ? 'lost' : solved || earned >= 2 ? 'on' : '',
    game.firstLaunchPerfect === false ? 'lost' : game.firstLaunchPerfect ? 'on' : '',
  ];
  for (let i = 0; i < 3; i++) starEls[i].className = `star ${states[i]}`;

  // honk
  const honk = $('btn-honk');
  const p = 1 - game.honkCd / 5;
  honk.style.setProperty('--p', `${Math.max(0, Math.min(1, p)) * 360}deg`);
  honk.classList.toggle('cooling', game.honkCd > 0);
  $('honk-ok').classList.toggle('hidden', !(game.honkCd === 0 && game.honkWouldDistract() && !game.def.bonus && game.phase === 'play'));

  // beak + prompt
  const beak = game.stall.beak;
  $('beak-text').textContent = beak ? `במקור: ${kindName(beak.kind, beak, game.def.unknown)}` : 'במקור: ריק';
  $('beak-pill').classList.toggle('full', !!beak);
  const it = game.phase === 'play' || game.phase === 'solved' ? game.interaction() : null;
  const cardOpen = game.message && game.message.ttl === undefined;
  $('prompt').classList.toggle('hidden', !it || !!cardOpen);
  if (it) $('prompt-text').textContent = it.verb;
  $('objective-text').textContent = game.objective();

  const lp = $('load-pill');
  if (game.phase === 'solved' && game.def.seesawN) {
    lp.classList.remove('hidden');
    lp.textContent = `על הנדנדה: ${seesawLoad(game.stall)} ק״ג`;
  } else lp.classList.add('hidden');

  const hintBtn = $('btn-hint');
  hintBtn.setAttribute('aria-pressed', String(game.hintOn));
  hintBtn.classList.toggle('disabled', !game.def.hint);

  // message card / toast
  const m = game.message;
  const card = $('card');
  const toast = $('toast');
  if (m && m.ttl === undefined) {
    toast.classList.add('hidden');
    if (card.dataset.key !== m.title + m.body.join()) {
      card.dataset.key = m.title + m.body.join();
      card.dataset.kind = m.kind;
      $('card-title').textContent = m.title;
      $('card-body').innerHTML = m.body
        .map((b) => {
          if (/^x = \d+$/.test(b)) return `<p class="big-x">${b}</p>`;
          const cls = b.startsWith('מה שעושים') ? ' class="rule"' : '';
          return `<p${cls}>${ltrMath(b)}</p>`;
        })
        .join('');
      $('card-btn').textContent = `${m.button ?? 'המשך'}`;
      card.classList.remove('hidden');
    }
  } else {
    card.classList.add('hidden');
    card.dataset.key = '';
    if (m) {
      toast.innerHTML = `${m.title ? `<b>${m.title}</b>` : ''}${m.body.map(ltrMath).join('<br>')}`;
      toast.classList.remove('hidden');
    } else toast.classList.add('hidden');
  }
}

/** Wrap formulas in LTR isolates so "3x + 2 = 8" never gets reordered inside Hebrew text. */
function ltrMath(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return esc.replace(/([0-9x][0-9x+\-−·=() .]*[0-9x)])/g, (m) => (/[x+\-−·=]/.test(m) ? `<bdi dir="ltr">${m}</bdi>` : m));
}

// ------------------------------------------------------------------ UI wiring

function wireUi() {
  $('btn-pause').addEventListener('click', () => togglePause());
  $('btn-sound').addEventListener('click', () => toggleMute());
  $('title-sound').addEventListener('click', () => toggleMute());
  $('btn-hint').addEventListener('click', () => toggleHint());
  $('card-btn').addEventListener('click', () => {
    initAudio();
    game.dismissMessage();
    if (game.phase === 'bonusDone') showFinale();
  });
  $('btn-play').addEventListener('click', () => {
    const next = Math.min(progress.unlocked, STALLS.length) - 1;
    const firstUnfinished = STALLS.findIndex((s, i) => i < progress.unlocked && !(progress.stars[s.id] > 0));
    startGame(firstUnfinished >= 0 ? firstUnfinished : next);
  });
  $('btn-select').addEventListener('click', () => showSelect());
  $('btn-how').addEventListener('click', () => showHow());
  $('title-settings').addEventListener('click', () => showSettings(false));
  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || !started || paused) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    if (moved > 8 || performance.now() - downAt.t > 400) return;
    initAudio();
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const hit = view.pick(ndc, game);
    if (hit?.itemId !== undefined) game.clickItem(hit.itemId);
    else if (hit?.pan) game.clickPan(hit.pan.scale, hit.pan.side);
  });
  window.addEventListener('keydown', (e) => {
    if (!started && (e.code === 'Enter' || e.code === 'Space') && $('overlay').classList.contains('hidden')) {
      $('btn-play').click();
    }
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started && !paused && !params.has('test')) togglePause(true);
  });
}

let downAt: { x: number; y: number; t: number } | null = null;

function startGame(index: number) {
  initAudio();
  started = true;
  paused = false;
  view.titleMode = false;
  $('title').classList.add('hidden');
  $('overlay').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !isTouch);
  game.loadStall(index);
  view.loadStall(game);
  canvas.focus();
}

function goTitle() {
  started = false;
  paused = false;
  view.titleMode = true;
  $('hud').classList.add('hidden');
  $('card').classList.add('hidden');
  $('overlay').classList.add('hidden');
  $('title').classList.remove('hidden');
  renderMedals();
}

function togglePause(force?: boolean) {
  if (!started) return;
  paused = force ?? !paused;
  if (paused) showSettings(true);
  else $('overlay').classList.add('hidden');
}

function toggleMute() {
  initAudio();
  settings.muted = !isMuted();
  setMuted(settings.muted);
  writeJSON(SETTINGS_KEY, settings);
  syncSoundButtons();
}

function syncSoundButtons() {
  for (const id of ['btn-sound', 'title-sound']) $(id).classList.toggle('off', isMuted());
}

function toggleHint() {
  if (!game.def.hint) {
    game.toast('בדוכן הזה אין שלט גיר — אתם כבר יודעים לבד.');
    return;
  }
  game.setHint(!game.hintOn);
}

function panel(html: string) {
  $('panel').innerHTML = html;
  $('overlay').classList.remove('hidden');
}

function showSettings(inGame: boolean) {
  panel(`
    <h2>${inGame ? 'הפסקה' : 'הגדרות'}</h2>
    <label class="toggle">צלילים <input type="checkbox" id="opt-sound" ${isMuted() ? '' : 'checked'}></label>
    <label class="toggle">תנועה מופחתת <input type="checkbox" id="opt-motion" ${settings.reducedMotion ? 'checked' : ''}></label>
    ${inGame && game.def.hint ? `<label class="toggle">שלט גיר (רמז) <input type="checkbox" id="opt-hint" ${game.hintOn ? 'checked' : ''}></label>` : ''}
    <div class="col">
      ${inGame ? '<button class="btn teal" id="p-resume">המשך</button><button class="btn cream" id="p-restart">התחלת הדוכן מחדש</button><button class="btn cream" id="p-select">בחירת דוכן</button><button class="btn cream" id="p-title">למסך הפתיחה</button>' : '<button class="btn teal" id="p-close">סגירה</button>'}
    </div>`);
  $('opt-sound').addEventListener('change', () => toggleMute());
  $('opt-motion').addEventListener('change', (e) => {
    settings.reducedMotion = (e.target as HTMLInputElement).checked;
    view.reducedMotion = settings.reducedMotion;
    writeJSON(SETTINGS_KEY, settings);
  });
  document.getElementById('opt-hint')?.addEventListener('change', () => toggleHint());
  document.getElementById('p-resume')?.addEventListener('click', () => togglePause(false));
  document.getElementById('p-restart')?.addEventListener('click', () => {
    game.restartStall();
    togglePause(false);
  });
  document.getElementById('p-select')?.addEventListener('click', () => showSelect());
  document.getElementById('p-title')?.addEventListener('click', () => goTitle());
  document.getElementById('p-close')?.addEventListener('click', () => $('overlay').classList.add('hidden'));
}

function medalHtml(i: number) {
  const s = STALLS[i];
  const locked = i >= progress.unlocked;
  const stars = progress.stars[s.id] ?? 0;
  if (s.bonus) {
    return `<button class="medal bonus ${locked ? 'locked' : ''}" data-i="${i}" aria-label="בונוס ${locked ? '(נעול)' : ''}"><span class="n">🪶</span><small>בונוס</small></button>`;
  }
  return `<button class="medal ${locked ? 'locked' : ''}" data-i="${i}" aria-label="דוכן ${i + 1} ${locked ? '(נעול)' : ''}"><span class="n">${i + 1}</span><span class="mini-stars">${[0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : ''}">★</i>`).join('')}</span></button>`;
}

function renderMedals() {
  const el = $('medals');
  el.innerHTML = STALLS.map((_, i) => medalHtml(i)).join('');
  el.querySelectorAll<HTMLButtonElement>('.medal').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      if (i < progress.unlocked) startGame(i);
    }),
  );
}

function showSelect() {
  panel(`<h2>בחירת דוכן</h2><div class="grid8">${STALLS.map((_, i) => medalHtml(i)).join('')}</div>
    <p>${STALLS.map((s) => `<b>${s.num}</b> ${s.title}`).slice(0, 4).join(' · ')}<br>${STALLS.map((s) => `<b>${s.num}</b> ${s.title}`).slice(4).join(' · ')}</p>
    <div class="col"><button class="btn cream" id="sel-close">חזרה</button></div>`);
  $('panel').querySelectorAll<HTMLButtonElement>('.medal').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      if (i < progress.unlocked) startGame(i);
    }),
  );
  $('sel-close').addEventListener('click', () => (started ? showSettings(true) : $('overlay').classList.add('hidden')));
}

function showHow() {
  panel(`<h2>איך משחקים?</h2>
    <ol class="how">
      <li>כל מאזניים בשוק הם <b>משוואה</b>: שקים זהים הם הנעלם <bdi dir="ltr">x</bdi>, והמשקולות הן מספרים.</li>
      <li>קחו פריט אחד במקור (<kbd>E</kbd> או לחיצה) והניחו אותו על כף, על הרצפה, בקופת העודף או על הנדנדה.</li>
      <li>כל עוד המאזניים לא מאוזנים — אסור שהמוכר יראה! <b>מה שעושים לאגף אחד — עושים גם לשני</b>, ומהר.</li>
      <li>המוכר זמזם (♪) = בטוח. סימן שאלה (?) = הוא מסתובב. עין = הוא מסתכל.</li>
      <li>צפצוף (<kbd>Q</kbd>) <b>מאחורי</b> המוכר גורם לו להסתכל לצד. צפצוף מול המאזניים רק מסובב אותו אליהם…</li>
      <li>קופת העודף פורטת משקולת לקטנות באותו משקל. לוח החלוקה משאיר על כל כף חלק אחד מתוך כמה חלקים שווים.</li>
      <li>בלון הליום שווה <bdi dir="ltr">−1</bdi> ק״ג. בלון ומשקולת של 1 על אותה כף נקשרים — ושווים 0.</li>
      <li>כשנשאר <b>שק אחד מול משקולות בלבד</b> — גיליתם את <bdi dir="ltr">x</bdi>! עכשיו העמיסו את הנדנדה ועופו לדוכן הבא.</li>
    </ol>
    <div class="col"><button class="btn teal" id="how-close">הבנתי</button></div>`);
  $('how-close').addEventListener('click', () => (started ? showSettings(true) : $('overlay').classList.add('hidden')));
}

function showStallDone(stars: number) {
  const last = game.stallIndex >= STALLS.length - 2;
  const labels = ['גיליתם את x', 'בלי להיתפס', 'שיגור מדויק בניסיון הראשון'];
  const got = [true, game.caught === 0, !!game.firstLaunchPerfect];
  setTimeout(() => {
    panel(`<h2>${game.def.title} — עברתם!</h2>
      <div class="result-stars">${labels.map((l, i) => `<figure><span class="star ${got[i] ? 'on' : ''}"></span>${l}</figure>`).join('')}</div>
      <p>${stars} מתוך 3 כוכבים. <bdi dir="ltr">x = ${game.solvedX}</bdi></p>
      ${last ? '<p><b>סיימתם את כל הדוכנים בשוק!</b> נשאר רק בונוס אחד מכושף…</p>' : ''}
      <div class="col"><button class="btn teal" id="next">${last ? 'לבונוס: המאזניים המכושפים' : 'לדוכן הבא'}</button><button class="btn cream" id="again">לשחק שוב בדוכן</button></div>`);
    $('next').addEventListener('click', () => startGame(game.stallIndex + 1));
    $('again').addEventListener('click', () => startGame(game.stallIndex));
  }, 600);
}

function showFinale() {
  const total = STALLS.filter((s) => !s.bonus).reduce((a, s) => a + (progress.stars[s.id] ?? 0), 0);
  panel(`<h2>השוק כולו שלכם!</h2>
    <p>⭐ <bdi dir="ltr">${total} / 21</bdi> כוכבים · 🪶 <bdi dir="ltr">${game.feathers} / 2</bdi> נוצות זהב</p>
    <p>גיליתם את המשקל של כל השקים בשוק — בלי לשבור את האיזון. ובמאזניים המכושפים ראיתם שלא לכל משוואה יש פתרון יחיד.</p>
    <div class="col"><button class="btn teal" id="fin-title">למסך הפתיחה</button><button class="btn cream" id="fin-select">בחירת דוכן</button></div>`);
  $('fin-title').addEventListener('click', () => goTitle());
  $('fin-select').addEventListener('click', () => showSelect());
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  if (view) {
    view.camera.aspect = innerWidth / innerHeight;
    view.camera.updateProjectionMatrix();
  }
}

// ------------------------------------------------------------------ test hooks

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    __game: () => Game;
    __debug: { fps: () => number; start: (i: number) => void; act: (a: string) => void; move: (x: number, z: number, ms: number) => void; info: () => unknown };
  }
}

window.render_game_to_text = () => JSON.stringify({ started, paused, fps: Math.round(fps), ...(game ? game.textState(params.has('debug')) : { loading: true }) });
window.advanceTime = (ms: number) => {
  manualTime = true;
  const n = Math.max(1, Math.round(ms / (STEP * 1000)));
  for (let i = 0; i < n; i++) step(STEP);
  render();
};
window.__game = () => game;
window.__debug = {
  fps: () => fps,
  start: (i: number) => startGame(i),
  act: (a: string) => handleAction(a),
  move: (x: number, z: number, ms: number) => {
    // world-space walk for automated tests
    const n = Math.round(ms / (STEP * 1000));
    for (let i = 0; i < n; i++) {
      game.update(STEP, { x, z });
      const ev = game.events.splice(0);
      onEvents(ev);
      view.handleEvents(game, ev);
      view.update(game, STEP);
    }
    render();
  },
  info: () => ({ draws: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }),
};

void boot();
