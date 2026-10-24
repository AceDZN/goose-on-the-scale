// Game controller: goose, vendors, interactions, catching, seesaw and the bonus.
// Pure TypeScript (no Three.js, no DOM) so it can be stepped deterministically.
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
  isUnknown,
  itemValue,
  launchOutcome,
  panChanges,
  seesawLoad,
  share,
  shareCheck,
  solvedValue,
  type Item,
  type Kind,
  type LaunchOutcome,
  type Loc,
  type Result,
  type Side,
  type StallState,
  type Verdict,
} from './rules.ts';
import { STALLS, buildStall, vendorConfig, type StallDef } from './levels.ts';
import {
  HONK_COOLDOWN,
  celebrate,
  honkDistracts,
  honkVendor,
  initVendor,
  shoo,
  tickVendor,
  watchesScale,
  type VendorConfig,
  type VendorState,
} from './vendor.ts';
import {
  CHANGE_BOX,
  COUNTER,
  FLOOR,
  GOOSE_RADIUS,
  GOOSE_SPEED,
  PAN_RADIUS,
  PAN_REACH,
  PLATE_HALF,
  SEESAW,
  SHARE_PLATES,
  SHELVES,
  START,
  SUPPLY,
  WALL_X,
  panCenter,
  panSlot,
  stampPlates,
  type Box,
  type Circle,
} from './layout.ts';

export type Phase = 'intro' | 'play' | 'solved' | 'launching' | 'flying' | 'stallDone' | 'bonusDone';

export interface Message {
  kind: 'caught' | 'info' | 'solved' | 'launch' | 'share' | 'stamp' | 'intro';
  title: string;
  body: string[];
  button?: string;
  /** Seconds left before a toast message hides itself (cards wait for a button). */
  ttl?: number;
}

export interface GameEvent {
  type: string;
  [k: string]: unknown;
}

export interface Goose {
  x: number;
  z: number;
  yaw: number;
  y: number;
  vy: number;
  moving: boolean;
  /** Seconds the goose stays stunned after being shooed / splatting. */
  stun: number;
  flapT: number;
  honkT: number;
}

export interface Flight {
  outcome: LaunchOutcome;
  t: number;
  dur: number;
  from: { x: number; z: number };
  to: { x: number; z: number };
  peak: number;
}

export interface Interaction {
  verb: string;
  run: () => Result | null;
  kind: 'grab' | 'drop' | 'change' | 'share' | 'seesaw' | 'launch' | 'stamp' | 'ground';
}

export interface LogEntry {
  t: number;
  stall: string;
  action: string;
  [k: string]: unknown;
}

const SIDE_HE: Record<Side, string> = { L: 'הכף השמאלית', R: 'הכף הימנית' };

export function kindName(kind: Kind, item?: Item, unknown: 'sack' | 'jar' = 'sack'): string {
  switch (kind) {
    case 'sack':
      return 'שק';
    case 'jar':
      return 'צנצנת';
    case 'w1':
    case 'w2':
    case 'w5':
    case 'w10':
      return `משקולת ${kind.slice(1)} ק״ג`;
    case 'balloon':
      return 'בלון הליום';
    case 'pair':
      return 'בלון קשור למשקולת 1 (שווה 0)';
    case 'bundle':
      return `צרור עודף ${(item?.parts ?? []).join('+')}`;
  }
  return unknown === 'jar' ? 'צנצנת' : 'שק';
}

function inBox(x: number, z: number, b: Box, pad = 0) {
  return x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
}

export class Game {
  def!: StallDef;
  stallIndex = 0;
  stall!: StallState;
  snapshot!: StallState;
  vendors: VendorState[] = [];
  vcfgs: VendorConfig[] = [];
  goose: Goose = { x: START.x, z: START.z, yaw: 0, y: 0, vy: 0, moving: false, stun: 0, flapT: 0, honkT: 0 };
  phase: Phase = 'intro';
  honkCd = 0;
  hintOn = false;
  hintUsed = false;
  caught = 0;
  launches = 0;
  firstLaunchPerfect: boolean | null = null;
  solvedX: number | null = null;
  message: Message | null = null;
  lastOutcome = 'none';
  flight: Flight | null = null;
  verdicts: (Verdict | null)[] = [];
  time = 0;
  events: GameEvent[] = [];
  log: LogEntry[] = [];
  obstacles: { circles: Circle[]; boxes: Box[] } = { circles: [], boxes: [] };
  stars: Record<string, number> = {};
  feathers = 0;
  onLog: ((e: LogEntry) => void) | null = null;
  /** Seconds since the scale last became unbalanced (for the HUD "tipping" pulse). */
  unbalancedFor = 0;

  constructor(stallIndex = 0) {
    this.loadStall(stallIndex);
  }

  get scale() {
    return this.stall.scales[0];
  }

  emit(type: string, data: Record<string, unknown> = {}) {
    this.events.push({ type, ...data });
  }

  record(action: string, data: Record<string, unknown> = {}) {
    const e: LogEntry = { t: Math.round(this.time * 100) / 100, stall: this.def.id, action, ...data };
    this.log.push(e);
    this.onLog?.(e);
  }

  loadStall(i: number) {
    this.stallIndex = Math.max(0, Math.min(STALLS.length - 1, i));
    this.def = STALLS[this.stallIndex];
    this.stall = buildStall(this.def);
    this.snapshot = structuredClone(this.stall);
    this.vcfgs = this.def.vendors.map((_, vi) => vendorConfig(this.def, vi));
    this.vendors = this.vcfgs.map(initVendor);
    this.goose = { x: START.x, z: START.z, yaw: Math.PI * 0.75, y: 0, vy: 0, moving: false, stun: 0, flapT: 0, honkT: 0 };
    this.phase = 'intro';
    this.honkCd = 0;
    this.hintOn = this.stallIndex === 0;
    this.hintUsed = false;
    this.caught = 0;
    this.launches = 0;
    this.firstLaunchPerfect = null;
    this.solvedX = null;
    this.flight = null;
    this.lastOutcome = 'none';
    this.verdicts = this.def.scales.map(() => null);
    this.unbalancedFor = 0;
    this.message = {
      kind: 'intro',
      title: `דוכן ${this.def.num} · ${this.def.title}`,
      body: [this.def.intro],
      button: 'יאללה!',
    };
    this.buildObstacles();
    this.emit('stallLoaded', { index: this.stallIndex });
    this.record('stall_start', { equation: this.def.scales.map((s) => equationString(this.stall.scales[this.def.scales.indexOf(s)])) });
  }

  restartStall() {
    this.record('restart');
    this.loadStall(this.stallIndex);
    this.message = null;
    this.phase = 'play';
  }

  private buildObstacles() {
    const circles: Circle[] = [];
    for (const sc of this.def.scales) {
      circles.push({ x: sc.pos.x, z: sc.pos.z, r: 0.28 });
      for (const side of ['L', 'R'] as Side[]) {
        const p = panCenter(sc.pos, side);
        circles.push({ x: p.x, z: p.z, r: PAN_RADIUS });
      }
    }
    if (this.def.changeBox) circles.push(CHANGE_BOX);
    if (this.def.supply.length) circles.push(SUPPLY);
    for (const v of this.def.vendors) circles.push({ x: v.pos.x, z: v.pos.z, r: 0.45 });
    circles.push({ x: SEESAW.bucket.x + 0.1, z: SEESAW.bucket.z, r: 0.42 });
    this.obstacles = { circles, boxes: [COUNTER, SHELVES] };
  }

  dismissMessage() {
    if (!this.message) return;
    const kind = this.message.kind;
    this.message = null;
    if (kind === 'intro' && this.phase === 'intro') {
      this.phase = 'play';
      this.emit('play');
    }
  }

  setHint(on: boolean) {
    if (!this.def.hint) return;
    this.hintOn = on;
    if (on) this.hintUsed = true;
    this.record('hint', { on });
  }

  // ---------------------------------------------------------------- update

  update(dt: number, move: { x: number; z: number }) {
    this.time += dt;
    if (this.message?.ttl !== undefined) {
      this.message.ttl -= dt;
      if (this.message.ttl <= 0) this.message = null;
    }
    this.honkCd = Math.max(0, this.honkCd - dt);
    const g = this.goose;
    g.flapT = Math.max(0, g.flapT - dt);
    g.honkT = Math.max(0, g.honkT - dt);

    if (this.phase === 'flying' || this.phase === 'launching') {
      this.updateFlight(dt);
      return;
    }
    if (this.phase === 'intro' || this.phase === 'stallDone' || this.phase === 'bonusDone') return;
    const cardOpen = this.message && this.message.ttl === undefined;
    if (cardOpen) return;

    // vendors
    const before = this.vendors.map((v) => v.mode);
    this.vendors = this.vendors.map((v, i) => tickVendor(v, this.vcfgs[i], dt));
    this.vendors.forEach((v, i) => {
      if (v.mode !== before[i]) this.emit('vendorMode', { vendor: i, mode: v.mode, from: before[i] });
    });

    // goose
    if (g.stun > 0) {
      g.stun -= dt;
      move = { x: 0, z: 0 };
    }
    this.moveGoose(dt, move);

    // stealth check
    if (this.phase === 'play' && !this.def.bonus) {
      const bal = isBalanced(this.scale);
      this.unbalancedFor = bal ? 0 : this.unbalancedFor + dt;
      const watcher = this.vendors.findIndex((v) => watchesScale(v));
      if (!bal && watcher >= 0) this.getCaught(watcher);
    }
  }

  private moveGoose(dt: number, move: { x: number; z: number }) {
    const g = this.goose;
    const len = Math.hypot(move.x, move.z);
    g.moving = len > 0.05;
    if (g.moving) {
      const speed = GOOSE_SPEED * Math.min(1, len) * (g.y > 0.01 ? 1.15 : 1);
      let nx = g.x + move.x * speed * dt;
      let nz = g.z + move.z * speed * dt;
      const target = Math.atan2(move.x, move.z);
      let d = target - g.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.yaw += d * Math.min(1, dt * 12);
      [nx, nz] = this.collide(nx, nz);
      g.x = nx;
      g.z = nz;
    }
    // hop physics
    if (g.y > 0 || g.vy > 0) {
      g.vy -= 18 * dt;
      g.y += g.vy * dt;
      if (g.y <= 0) {
        g.y = 0;
        g.vy = 0;
        this.emit('land', { x: g.x, z: g.z });
      }
    }
  }

  private collide(x: number, z: number): [number, number] {
    x = Math.max(FLOOR.minX + GOOSE_RADIUS, Math.min(FLOOR.maxX - GOOSE_RADIUS, x));
    z = Math.max(FLOOR.minZ + GOOSE_RADIUS, Math.min(FLOOR.maxZ - GOOSE_RADIUS, z));
    for (const c of this.obstacles.circles) {
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + GOOSE_RADIUS;
      if (d < min && d > 1e-6) {
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
      }
    }
    for (const b of this.obstacles.boxes) {
      if (inBox(x, z, b, GOOSE_RADIUS)) {
        const pushes = [
          { d: x - (b.minX - GOOSE_RADIUS), ax: 'x', v: b.minX - GOOSE_RADIUS },
          { d: b.maxX + GOOSE_RADIUS - x, ax: 'x', v: b.maxX + GOOSE_RADIUS },
          { d: z - (b.minZ - GOOSE_RADIUS), ax: 'z', v: b.minZ - GOOSE_RADIUS },
          { d: b.maxZ + GOOSE_RADIUS - z, ax: 'z', v: b.maxZ + GOOSE_RADIUS },
        ].sort((a, c) => a.d - c.d)[0];
        if (pushes.ax === 'x') x = pushes.v;
        else z = pushes.v;
      }
    }
    return [x, z];
  }

  // ---------------------------------------------------------------- stealth

  private getCaught(vendor: number) {
    const sc = this.scale;
    const snap = this.snapshot.scales[0];
    const changes = panChanges(snap, sc);
    const body: string[] = [];
    for (const side of ['L', 'R'] as Side[]) {
      const removed = changes.filter((c) => c.side === side && c.delta < 0);
      const added = changes.filter((c) => c.side === side && c.delta > 0);
      const parts: string[] = [];
      const fmt = (c: { kind: Kind; delta: number }) =>
        `${Math.abs(c.delta) > 1 ? `${Math.abs(c.delta)} × ` : ''}${kindName(c.kind, undefined, this.def.unknown)}`;
      if (removed.length) parts.push(`ירדו: ${removed.map(fmt).join(', ')}`);
      if (added.length) parts.push(`עלו: ${added.map(fmt).join(', ')}`);
      body.push(`${SIDE_HE[side]} — ${parts.length ? parts.join('; ') : 'לא השתנתה'}.`);
    }
    // The difference, written with x when unknowns moved unevenly (so getting caught never reveals x).
    let a = 0;
    let b = 0;
    for (const c of changes) {
      const sign = c.side === 'L' ? 1 : -1;
      if (isUnknown(c.kind)) a += sign * c.delta;
      else b += sign * c.delta * itemValue({ id: 0, kind: c.kind }, 0);
    }
    const d = difference(sc);
    const heavier: Side = d > 0 ? 'L' : 'R';
    const lighter: Side = heavier === 'L' ? 'R' : 'L';
    const mag = heavier === 'L' ? { a, b } : { a: -a, b: -b };
    const expr = formatLinear(mag.a, mag.b);
    body.push(`${SIDE_HE[heavier]} כבדה יותר ב־${expr} ק״ג מ${SIDE_HE[lighter]}.`);
    if (changes.some((c) => c.kind === 'balloon')) body.push('בלון מושך למעלה: מורידים בלון — הכף נהיית כבדה יותר.');
    body.push('מה שעושים לאגף אחד — עושים גם לשני.');
    this.caught++;
    this.lastOutcome = `caught_unbalanced: ${heavier === 'L' ? 'left' : 'right'}_heavier_by_${a === 0 ? Math.abs(b) : expr.replace(/\s/g, '')}`;
    this.record('caught', { equation: equationString(sc), diff: a === 0 ? d : expr, changes });
    this.vendors[vendor] = shoo(this.vendors[vendor]);
    this.goose.stun = 1.1;
    this.goose.vy = 5;
    this.goose.y = 0.01;
    this.emit('caught', { vendor, diff: a === 0 ? Math.abs(d) : null, heavier });
    this.message = { kind: 'caught', title: 'נתפסת!', body, button: 'חזרה למצב המאוזן' };
    // Reset to the last balanced state, shoo the goose back.
    this.stall = structuredClone(this.snapshot);
    const away = { x: this.goose.x - this.vcfgs[vendor].pos.x, z: this.goose.z - this.vcfgs[vendor].pos.z };
    const l = Math.hypot(away.x, away.z) || 1;
    const [nx, nz] = this.collide(this.goose.x + (away.x / l) * 2.2, this.goose.z + (away.z / l) * 2.2);
    this.goose.x = nx;
    this.goose.z = nz;
    this.emit('reset');
  }

  honk() {
    if (this.honkCd > 0 || this.phase === 'intro') return;
    this.honkCd = HONK_COOLDOWN;
    this.goose.honkT = 0.5;
    this.emit('honk', { x: this.goose.x, z: this.goose.z });
    const effects = this.vendors.map((v, i) => {
      const r = honkVendor(v, this.vcfgs[i], this.goose);
      this.vendors[i] = r.state;
      return r.effect;
    });
    this.record('honk', { effects, pos: { x: round(this.goose.x), z: round(this.goose.z) } });
    if (effects.includes('noticed') && !this.def.bonus && this.phase === 'play') {
      this.toast('המוכר הסתובב אליך — וגם אל המאזניים! צפצפו מאחוריו.', 2.6);
    }
  }

  /** Is a honk from where the goose stands going to distract every awake vendor? */
  honkWouldDistract(): boolean {
    return this.vcfgs.every((c, i) => this.vendors[i].mode === 'asleep' || honkDistracts(c, this.goose));
  }

  flap() {
    const g = this.goose;
    if (this.phase === 'solved') {
      const it = this.interaction();
      if (it?.kind === 'launch') {
        it.run();
        return;
      }
    }
    if (g.y > 0.001 || g.stun > 0) return;
    g.vy = 5.2;
    g.y = 0.001;
    g.flapT = 0.4;
    this.emit('flap');
  }

  toast(text: string, ttl = 2.2) {
    if (this.message && this.message.ttl === undefined) return;
    this.message = { kind: 'info', title: '', body: [text], ttl };
  }

  // ---------------------------------------------------------------- interactions

  private beakPos() {
    const g = this.goose;
    return { x: g.x + Math.sin(g.yaw) * 0.45, z: g.z + Math.cos(g.yaw) * 0.45 };
  }

  private distTo(p: { x: number; z: number }) {
    return Math.hypot(this.goose.x - p.x, this.goose.z - p.z);
  }

  /** Items visible on a pan, in slot order (the view uses the same order to place them). */
  nearestPan(): { scale: number; side: Side; d: number } | null {
    let best: { scale: number; side: Side; d: number } | null = null;
    this.def.scales.forEach((sc, i) => {
      for (const side of ['L', 'R'] as Side[]) {
        const d = this.distTo(panCenter(sc.pos, side));
        if (d <= PAN_REACH && (!best || d < best.d)) best = { scale: i, side, d };
      }
    });
    return best;
  }

  /** What E/click would do right now. */
  interaction(): Interaction | null {
    if (this.goose.stun > 0) return null;
    const s = this.stall;
    const beak = s.beak;
    const g = this.goose;
    const pan = this.nearestPan();

    if (this.phase === 'solved' && this.def.seesawN) {
      if (!beak && this.distTo(SEESAW.gooseEnd) < 0.75) {
        return { verb: `לשגר! (על הנדנדה ${seesawLoad(s)} ק״ג)`, kind: 'launch', run: () => this.launch() };
      }
      if (this.distTo(SEESAW.bucket) < 1.25) {
        if (beak) return { verb: 'להעמיס על הנדנדה', kind: 'seesaw', run: () => this.apply(dropOnSeesaw(s), 'seesaw_load') };
        const top = s.seesaw[s.seesaw.length - 1];
        if (top) return { verb: `להוריד ${kindName(top.kind)} מהנדנדה`, kind: 'grab', run: () => this.apply(grab(s, { at: 'seesaw' }, top.id), 'seesaw_unload') };
      }
    }

    if (beak) {
      if (this.def.changeBox && this.distTo(CHANGE_BOX) < 1.15) {
        if (['w2', 'w5', 'w10'].includes(beak.kind)) {
          return { verb: `לפרוט ${kindName(beak.kind)} בקופת העודף`, kind: 'change', run: () => this.apply(change(s), 'change') };
        }
      }
      if (pan) {
        return {
          verb: `להניח ${kindName(beak.kind, beak)} על ${SIDE_HE[pan.side]}`,
          kind: 'drop',
          run: () => this.apply(dropOnPan(s, pan.scale, pan.side), 'drop_pan', { side: pan.side, scale: pan.scale }),
        };
      }
      const bp = this.beakPos();
      return {
        verb: beak.kind === 'balloon' ? 'לשחרר את הבלון' : `להניח ${kindName(beak.kind, beak)} על הרצפה`,
        kind: 'ground',
        run: () => this.apply(dropOnGround(s, this.clampDrop(bp)), 'drop_ground'),
      };
    }

    // empty beak: plates first (standing on them), then items
    if (this.def.shareBoard && this.phase === 'play') {
      for (const p of SHARE_PLATES) {
        if (Math.abs(g.x - p.x) < PLATE_HALF && Math.abs(g.z - p.z) < PLATE_HALF) {
          return { verb: `לחלק כל כף ל־${p.k} קבוצות שוות`, kind: 'share', run: () => this.doShare(p.k) };
        }
      }
    }
    if (this.def.bonus) {
      for (let i = 0; i < this.def.scales.length; i++) {
        for (const p of stampPlates(this.def.scales[i].pos)) {
          if (Math.abs(g.x - p.x) < 0.42 && Math.abs(g.z - p.z) < 0.42) {
            const label = p.verdict === 'identity' ? '∞ אינסוף פתרונות' : '∅ אין פתרון';
            return { verb: `להחתים: ${label}`, kind: 'stamp', run: () => this.stamp(i, p.verdict) };
          }
        }
      }
    }
    if (pan && (this.phase === 'play' || this.def.bonus)) {
      const list = s.scales[pan.scale][pan.side];
      if (list.length) {
        const it = this.pickOnPan(pan.scale, pan.side);
        return {
          verb: `לקחת ${kindName(it.kind, it)} מ${SIDE_HE[pan.side]}`,
          kind: 'grab',
          run: () => this.apply(grab(s, { at: 'pan', scale: pan.scale, side: pan.side }, it.id), 'grab_pan', { side: pan.side, kind: it.kind }),
        };
      }
    }
    if (this.def.supply.length && s.supply.length && this.distTo(SUPPLY) < 1.15) {
      const it = s.supply[s.supply.length - 1];
      return { verb: `לקחת ${kindName(it.kind)} מארגז המשקולות`, kind: 'grab', run: () => this.apply(grab(s, { at: 'supply' }, it.id), 'grab_supply', { kind: it.kind }) };
    }
    let near: Item | null = null;
    let nd = 0.95;
    for (const it of s.ground) {
      if (!it.pos) continue;
      const d = this.distTo(it.pos);
      if (d < nd) {
        nd = d;
        near = it;
      }
    }
    if (near) {
      const it = near;
      return { verb: `לקחת ${kindName(it.kind, it)} מהרצפה`, kind: 'grab', run: () => this.apply(grab(s, { at: 'ground' }, it.id), 'grab_ground', { kind: it.kind }) };
    }
    return null;
  }

  /** The item on a pan nearest to the goose's beak — mirrors the view's slot layout. */
  pickOnPan(scale: number, side: Side): Item {
    const list = this.stall.scales[scale][side];
    const c = panCenter(this.def.scales[scale].pos, side);
    const bp = this.beakPos();
    let best = list[list.length - 1];
    let bd = Infinity;
    list.forEach((it, i) => {
      const slot = slotFor(i, list.length);
      const d = Math.hypot(c.x + slot.x - bp.x, c.z + slot.z - bp.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    });
    return best;
  }

  interact() {
    if (this.message && this.message.ttl === undefined) {
      this.dismissMessage();
      return;
    }
    if (this.phase !== 'play' && this.phase !== 'solved') return;
    const it = this.interaction();
    if (!it) {
      this.emit('nothing');
      return;
    }
    it.run();
  }

  /** Click/tap on a specific item in the scene. */
  clickItem(id: number) {
    if (this.message && this.message.ttl === undefined) return;
    if (this.stall.beak || this.goose.stun > 0) return;
    const s = this.stall;
    for (let si = 0; si < s.scales.length; si++) {
      for (const side of ['L', 'R'] as Side[]) {
        const it = s.scales[si][side].find((i) => i.id === id);
        if (it && this.distTo(panCenter(this.def.scales[si].pos, side)) <= PAN_REACH + 0.35 && (this.phase === 'play' || this.def.bonus)) {
          this.apply(grab(s, { at: 'pan', scale: si, side }, id), 'grab_pan', { side, kind: it.kind });
          return;
        }
      }
    }
    const g = s.ground.find((i) => i.id === id);
    if (g?.pos && this.distTo(g.pos) < 1.4) this.apply(grab(s, { at: 'ground' }, id), 'grab_ground', { kind: g.kind });
  }

  clickPan(scale: number, side: Side) {
    if (!this.stall.beak) return;
    if (this.distTo(panCenter(this.def.scales[scale].pos, side)) > PAN_REACH + 0.35) return;
    this.apply(dropOnPan(this.stall, scale, side), 'drop_pan', { side, scale });
  }

  private clampDrop(p: { x: number; z: number }) {
    let [x, z] = this.collide(p.x, p.z);
    x = Math.max(FLOOR.minX + 0.4, Math.min(FLOOR.maxX - 0.4, x));
    z = Math.max(FLOOR.minZ + 0.4, Math.min(FLOOR.maxZ - 0.4, z));
    // keep dropped items off the share plates
    for (const pl of SHARE_PLATES) if (Math.abs(x - pl.x) < PLATE_HALF && Math.abs(z - pl.z) < PLATE_HALF) z = pl.z + PLATE_HALF + 0.3;
    return { x, z };
  }

  private apply(r: Result, action: string, data: Record<string, unknown> = {}): Result {
    if (!r.ok) {
      this.emit('refused', { reason: r.reason });
      if (r.reason === 'seesaw_blocks_only') this.toast('על הנדנדה שמים רק משקולות.');
      return r;
    }
    const wasBalanced = isBalanced(this.scale);
    this.stall = r.state;
    this.emit('action', { action, event: r.event, ...data });
    this.record(action, { event: r.event, equation: equationString(this.scale), balanced: isBalanced(this.scale), ...data });
    this.afterChange(wasBalanced);
    return r;
  }

  private afterChange(wasBalanced: boolean) {
    const bal = isBalanced(this.scale);
    if (bal) this.snapshot = structuredClone(this.stall);
    if (bal !== wasBalanced) this.emit(bal ? 'balanced' : 'tipped');
    if (this.phase === 'play' && !this.def.bonus) {
      const x = solvedValue(this.scale);
      if (x !== null) this.solve(x);
    }
  }

  private doShare(k: number): Result {
    const s = this.stall;
    const r = share(s, 0, k);
    if (!r.ok) {
      const fail = shareCheck(s.scales[0], k);
      const side = fail ? SIDE_HE[fail.side] : '';
      let why = 'לוח החלוקה נתקע.';
      if (fail?.why === 'balloons') why = `ב${side} יש בלונים. קשרו או הורידו אותם קודם — אי אפשר לחלק בלון.`;
      else if (fail?.why === 'sacks') why = `ב${side} יש ${fail.sacks} ${this.def.unknown === 'jar' ? 'צנצנות' : 'שקים'} — אי אפשר לחלק אותם ל־${k} קבוצות שוות.`;
      else if (fail?.why === 'total') why = `ב${side} יש ${fail.total} ק״ג במשקולות — זה לא מתחלק ב־${k}.`;
      else if (fail?.why === 'blocks')
        why = `ב${side} יש ${fail.total} ק״ג, וזה מתחלק ב־${k} — אבל המשקולת של ${fail.biggest} ק״ג גדולה מדי לקבוצה של ${fail.total / k} ק״ג. פרטו אותה בקופת העודף.`;
      this.message = { kind: 'share', title: `חלוקה ל־${k}: בוינג!`, body: [why], ttl: 4.5 };
      this.emit('shareFail', { k });
      this.record('share_fail', { k, reason: r.reason, equation: equationString(s.scales[0]) });
      return r;
    }
    const wasBalanced = isBalanced(this.scale);
    // Pushed-off groups land in a tidy row in front of the scale.
    const moved = r.state.ground.filter((it) => !s.ground.some((g) => g.id === it.id));
    moved.forEach((it, i) => {
      it.pos = { x: -2.6 + (i % 8) * 0.55 + (i >= 8 ? 0.27 : 0), z: 3.0 + Math.floor(i / 8) * 0.55 };
    });
    this.stall = r.state;
    this.emit('share', { k, moved: moved.map((m) => m.id) });
    this.record('share', { k, equation: equationString(this.scale) });
    this.afterChange(wasBalanced);
    return r;
  }

  private solve(x: number) {
    this.phase = 'solved';
    this.solvedX = x;
    this.vendors = this.vendors.map(celebrate);
    // The vendor takes the sacks back; only blocks are left to play with.
    const s = this.stall;
    const unknownIds: number[] = [];
    for (const list of [s.scales[0].L, s.scales[0].R, s.ground]) {
      for (const it of list) if (isUnknown(it.kind)) unknownIds.push(it.id);
    }
    const name = this.def.unknown === 'jar' ? 'הצנצנת' : 'השק';
    const n = this.def.seesawN ?? 0;
    this.message = {
      kind: 'solved',
      title: `${name} שוקל${this.def.unknown === 'jar' ? 'ת' : ''} ${x} ק״ג!`,
      body: [
        `x = ${x}`,
        `עכשיו לנדנדה: כדי לעוף מעל החומה צריך להעמיס עליה בדיוק את המשקל של ${n} ${this.def.unknown === 'jar' ? 'צנצנות' : 'שקים'}.`,
      ],
      button: 'לנדנדה!',
    };
    this.lastOutcome = `solved_x_${x}`;
    this.emit('solved', { x, unknownIds });
    this.record('solved', { x, caught: this.caught, hint: this.hintUsed });
    for (const list of [s.scales[0].L, s.scales[0].R]) {
      for (let i = list.length - 1; i >= 0; i--) if (isUnknown(list[i].kind)) list.splice(i, 1);
    }
    s.ground = s.ground.filter((it) => !isUnknown(it.kind));
    if (s.beak && isUnknown(s.beak.kind)) s.beak = null;
    // Blocks still on the pans tumble to the floor next to the scale so they can be carried.
    const pos = this.def.scales[0].pos;
    for (const side of ['L', 'R'] as Side[]) {
      const list = s.scales[0][side];
      list.forEach((it, i) => {
        it.pos = { x: pos.x + (side === 'L' ? -1.5 : 1.5) + (i % 3) * 0.5 - 0.5, z: pos.z + 1.3 + Math.floor(i / 3) * 0.5 };
        s.ground.push(it);
      });
      s.scales[0][side] = [];
    }
    // Pairs and balloons are useless for the seesaw; let them float away.
    s.sky.push(...s.ground.filter((it) => it.kind === 'pair' || it.kind === 'balloon'));
    s.ground = s.ground.filter((it) => it.kind !== 'pair' && it.kind !== 'balloon');
    this.snapshot = structuredClone(this.stall);
  }

  launchTarget(): number {
    return (this.def.seesawN ?? 0) * (this.solvedX ?? 0);
  }

  private launch(): Result | null {
    if (this.phase !== 'solved' || !this.def.seesawN || this.solvedX === null) return null;
    const load = seesawLoad(this.stall);
    if (load === 0) {
      this.toast('הנדנדה ריקה. העמיסו משקולות בצד השני.');
      return null;
    }
    const target = this.launchTarget();
    const outcome = launchOutcome(load, target);
    this.launches++;
    if (this.firstLaunchPerfect === null) this.firstLaunchPerfect = outcome === 'perfect';
    this.record('launch', { load, target, outcome });
    const from = { x: SEESAW.gooseEnd.x, z: SEESAW.gooseEnd.z };
    const to =
      outcome === 'perfect'
        ? { x: WALL_X + 3.5, z: 2.2 }
        : outcome === 'short'
          ? { x: from.x + 1.4 + Math.max(0, load / target) * 1.2, z: 4.6 }
          : { x: from.x - 1.2, z: 1.2 };
    this.flight = { outcome, t: 0, dur: outcome === 'perfect' ? 1.9 : outcome === 'short' ? 0.9 : 1.6, from, to, peak: outcome === 'perfect' ? 6.5 : outcome === 'short' ? 1.2 : 9 };
    this.phase = 'launching';
    this.goose.x = from.x;
    this.goose.z = from.z;
    this.emit('launch', { outcome, load, target });
    return null;
  }

  private updateFlight(dt: number) {
    const f = this.flight;
    if (!f) return;
    f.t += dt;
    const u = Math.min(1, f.t / f.dur);
    const g = this.goose;
    g.x = f.from.x + (f.to.x - f.from.x) * u;
    g.z = f.from.z + (f.to.z - f.from.z) * u;
    g.y = 4 * f.peak * u * (1 - u) + (f.outcome === 'long' ? Math.sin(u * Math.PI) * 0.5 : 0);
    g.yaw = f.outcome === 'long' ? -Math.PI / 2 : Math.PI / 2;
    this.phase = 'flying';
    if (u < 1) return;
    g.y = 0;
    this.flight = null;
    const load = seesawLoad(this.stall);
    const target = this.launchTarget();
    const n = this.def.seesawN ?? 0;
    const unit = this.def.unknown === 'jar' ? 'צנצנות' : 'שקים';
    if (f.outcome === 'perfect') {
      const stars = 1 + (this.caught === 0 ? 1 : 0) + (this.firstLaunchPerfect ? 1 : 0);
      this.stars[this.def.id] = Math.max(this.stars[this.def.id] ?? 0, stars);
      this.phase = 'stallDone';
      this.lastOutcome = 'launch_perfect';
      this.emit('stallDone', { stars });
      return;
    }
    this.phase = 'solved';
    g.stun = 0.8;
    const body = [`על הנדנדה: ${load} ק״ג. צריך: משקל של ${n} ${unit}.`];
    if (this.launches >= 2) body.push(`${n} · ${this.solvedX} = ${target} ק״ג`);
    if (f.outcome === 'short') {
      this.lastOutcome = 'launch_short';
      this.message = { kind: 'launch', title: 'קל מדי — ישר לארגז העגבניות!', body, ttl: 5 };
      this.emit('splat', { x: g.x, z: g.z });
    } else {
      this.lastOutcome = 'launch_long';
      this.message = { kind: 'launch', title: 'כבד מדי — בום לתוך הסוכך!', body, ttl: 5 };
      this.emit('bonk', { x: g.x, z: g.z });
    }
  }

  nextStall() {
    if (this.stallIndex < STALLS.length - 1) this.loadStall(this.stallIndex + 1);
  }

  // ---------------------------------------------------------------- bonus

  private stamp(i: number, verdict: Verdict): Result | null {
    const sc = this.stall.scales[i];
    const actual = classify(sc);
    if (actual === 'needs_reduction') {
      this.message = {
        kind: 'stamp',
        title: 'עוד לא אפשר לדעת',
        body: ['יש עוד שקים על המאזניים. הורידו שק מכל כף — ואז תראו מה נשאר: משפט אמת או משפט שקר?'],
        ttl: 4.5,
      };
      this.record('stamp_early', { scale: i, verdict });
      return null;
    }
    const right = actual === verdict;
    this.record('stamp', { scale: i, verdict, right, equation: equationString(sc) });
    const line = equationString(sc);
    if (!right) {
      this.message = {
        kind: 'stamp',
        title: 'החותמת קפצה בחזרה!',
        body: [
          `נשאר: ${line}.`,
          actual === 'identity' ? 'זה משפט אמת לכל שק — המאזניים מאוזנים תמיד: אינסוף פתרונות.' : 'זה משפט שקר — אין שק שיאזן את המאזניים: אין פתרון.',
        ],
        ttl: 5,
      };
      this.emit('stampWrong', { scale: i });
      return null;
    }
    if (this.verdicts[i] === null) this.feathers++;
    this.verdicts[i] = verdict;
    this.emit('stampRight', { scale: i, verdict });
    const done = this.verdicts.every((v) => v !== null);
    this.message = {
      kind: 'stamp',
      title: 'נוצת זהב!',
      body: [
        `נשאר: ${line}.`,
        verdict === 'identity' ? 'משפט אמת שלא תלוי בשק: אינסוף פתרונות.' : 'משפט שקר: אין אף שק שיתאים — אין פתרון.',
      ],
      ttl: done ? undefined : 4,
      button: done ? 'סיום' : undefined,
    };
    if (done) {
      this.phase = 'bonusDone';
      this.stars[this.def.id] = 3;
      this.lastOutcome = 'bonus_done';
      this.emit('bonusDone');
    }
    return null;
  }

  // ---------------------------------------------------------------- reporting

  vendorSummary() {
    return this.vendors.map((v, i) => ({ mode: v.mode, t: round(v.t), honkDistracts: honkDistracts(this.vcfgs[i], this.goose) }));
  }

  textState(debug = false) {
    const s = this.stall;
    const pans = s.scales.map((sc, i) => ({
      scale: i,
      equation: equationString(sc),
      left: summary(sc.L),
      right: summary(sc.R),
      leftTotal: debug ? sc.L.reduce((a, it) => a + itemValue(it, sc.x), 0) : undefined,
      rightTotal: debug ? sc.R.reduce((a, it) => a + itemValue(it, sc.x), 0) : undefined,
      balanced: isBalanced(sc),
      tilt: Math.sign(difference(sc)),
      hiddenX: debug ? sc.x : undefined,
    }));
    return {
      stall: this.def.id,
      stallNumber: this.def.num,
      phase: this.phase,
      objective: this.objective(),
      coords: 'stall-local metres: x right, z toward camera, vendor at z≈-3.2',
      goose: { x: round(this.goose.x), z: round(this.goose.z), y: round(this.goose.y), beak: s.beak ? kindName(s.beak.kind, s.beak) : null, stun: round(this.goose.stun) },
      pans,
      ground: summary(s.ground),
      supply: summary(s.supply),
      seesaw: this.def.seesawN ? { load: seesawLoad(s), target: this.solvedX !== null ? this.launchTarget() : `${this.def.seesawN}·x` } : null,
      vendors: this.vendorSummary(),
      honkCooldown: round(this.honkCd),
      hint: this.hintOn ? 'chalk tag visible' : 'off',
      interaction: this.interaction()?.verb ?? null,
      message: this.message ? { title: this.message.title, body: this.message.body } : null,
      lastOutcome: this.lastOutcome,
      caught: this.caught,
      solvedX: this.solvedX,
      verdicts: this.def.bonus ? this.verdicts : undefined,
      stars: this.stars,
      feathers: this.feathers,
    };
  }

  objective(): string {
    if (this.def.bonus) return 'החתימו כל מאזניים: ∞ אינסוף פתרונות או ∅ אין פתרון';
    if (this.phase === 'solved' || this.phase === 'flying' || this.phase === 'launching') {
      return `העמיסו על הנדנדה משקל של ${this.def.seesawN} ${this.def.unknown === 'jar' ? 'צנצנות' : 'שקים'}, ושגרו!`;
    }
    return `השאירו ${this.def.unknown === 'jar' ? 'צנצנת אחת' : 'שק אחד'} מול משקולות בלבד`;
  }
}

export const slotFor = panSlot;

function summary(items: Item[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = it.kind === 'bundle' ? `bundle(${(it.parts ?? []).join('+')})` : it.kind;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

export function formatLinear(a: number, b: number): string {
  const xs = a === 0 ? '' : a === 1 ? 'x' : a === -1 ? '−x' : `${a < 0 ? '−' : ''}${Math.abs(a)}x`;
  if (!xs) return `${Math.abs(b)}`;
  if (b === 0) return xs;
  return `${xs} ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
}

export { STALLS };
