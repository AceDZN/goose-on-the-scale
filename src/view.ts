// Renders the Game state with Three.js. Reads the controller, never decides rules.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { difference, equationString, isBalanced, type Item, type Side } from './rules.ts';
import type { Game, GameEvent } from './game.ts';
import { SEESAW, SHARE_PLATES, PLATE_HALF, panSlot, START } from './layout.ts';
import { findClip, type LoadedModels } from './models.ts';
import {
  BEAM_Y,
  bubbleSprite,
  buildChangeBox,
  buildEnvironment,
  buildScale,
  buildSeesaw,
  buildShareBoard,
  buildStampPlates,
  buildSupplyCrate,
  itemMesh,
  setDial,
  type Environment,
  type ScaleRig,
  type SeesawRig,
} from './world.ts';
import { featherTexture, glowTexture } from './textures.ts';
import type { VendorMode } from './vendor.ts';

const TILT = 0.17;

interface VendorView {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  actions: Partial<Record<string, THREE.AnimationAction>>;
  current: string;
  yaw: number;
  bubble: THREE.Sprite;
  bubbleKey: string;
  bubbles: Record<string, THREE.Sprite>;
  cone: THREE.Mesh;
}

interface Particle {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  max: number;
  spin: number;
  gravity: number;
  fade: boolean;
}

export class View {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  env: Environment | null = null;
  stallGroup = new THREE.Group();
  scales: ScaleRig[] = [];
  seesaw: SeesawRig | null = null;
  sharePlates: THREE.Mesh[] = [];
  supplyAnchor: THREE.Group | null = null;
  goose = new THREE.Group();
  gooseBody = new THREE.Group();
  gooseMixer: THREE.AnimationMixer | null = null;
  gooseActions: Record<string, THREE.AnimationAction> = {};
  neckBones: THREE.Bone[] = [];
  neckRest: THREE.Quaternion[] = [];
  vendors: VendorView[] = [];
  items = new Map<number, THREE.Object3D>();
  dying: { obj: THREE.Object3D; t: number; vel: THREE.Vector3 }[] = [];
  particles: Particle[] = [];
  highlight: THREE.Mesh;
  plateGlow: THREE.Mesh;
  camYaw = 0;
  camTarget = new THREE.Vector3();
  camPos = new THREE.Vector3();
  shake = 0;
  dialTimer = 0;
  reducedMotion = false;
  titleMode = true;
  private time = 0;
  private lastChalk = '';
  private featherTex = featherTexture();
  private glowTex = glowTexture('255,230,150');
  private sun: THREE.DirectionalLight;
  private walkPhase = 0;
  private lastStall = -1;

  constructor(
    private models: LoadedModels,
    aspect: number,
    renderer?: THREE.WebGLRenderer,
  ) {
    if (renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.38;
    }
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 120);
    const sky = skyTexture();
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(0xf2d3a6, 22, 46);
    const hemi = new THREE.HemisphereLight(0xffe9c8, 0x6a4a2a, 0.7);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffcf8a, 3.2);
    sun.position.set(-7, 11, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -11;
    sc.right = 11;
    sc.top = 11;
    sc.bottom = -11;
    sc.near = 1;
    sc.far = 40;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.45);
    fill.position.set(6, 5, 8);
    this.scene.add(fill);

    this.scene.add(this.stallGroup);
    this.buildGoose();
    this.scene.add(this.goose);

    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.27, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.renderOrder = 5;
    this.scene.add(this.highlight);
    this.plateGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(PLATE_HALF * 2.1, PLATE_HALF * 2.1),
      new THREE.MeshBasicMaterial({ color: 0x9ff0d0, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.plateGlow.rotation.x = -Math.PI / 2;
    this.scene.add(this.plateGlow);
  }

  // ---------------------------------------------------------------- goose

  private buildGoose() {
    const m = this.models.goose;
    if (m) {
      const model = SkeletonUtils.clone(m);
      normalize(model, 0.82);
      this.gooseBody.add(model);
      model.traverse((o) => {
        if ((o as THREE.Bone).isBone && /Head_[0-3]$/.test(o.name)) this.neckBones.push(o as THREE.Bone);
      });
      this.neckRest = this.neckBones.map((b) => b.quaternion.clone());
      if (this.models.gooseClips.length) {
        this.gooseMixer = new THREE.AnimationMixer(model);
        for (const c of this.models.gooseClips) this.gooseActions[c.name.toLowerCase()] = this.gooseMixer.clipAction(c);
      }
    } else {
      this.gooseBody.add(fallbackGoose());
    }
    this.goose.add(this.gooseBody);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.name = 'blob';
    this.goose.add(shadow);
  }

  // ---------------------------------------------------------------- stall

  loadStall(game: Game) {
    this.stallGroup.clear();
    for (const o of this.items.values()) o.removeFromParent();
    this.items.clear();
    for (const v of this.vendors) v.root.removeFromParent();
    this.vendors = [];
    this.scales = [];
    this.sharePlates = [];
    this.supplyAnchor = null;
    const def = game.def;
    this.env = buildEnvironment(def);
    this.stallGroup.add(this.env.group);
    for (const sc of def.scales) {
      const rig = buildScale();
      rig.group.position.set(sc.pos.x, 0, sc.pos.z);
      this.stallGroup.add(rig.group);
      this.scales.push(rig);
      if (def.bonus) this.stallGroup.add(buildStampPlates(sc.pos));
    }
    if (def.changeBox) this.stallGroup.add(buildChangeBox());
    if (def.supply.length) {
      const s = buildSupplyCrate();
      this.stallGroup.add(s.group);
      this.supplyAnchor = s.anchor;
    }
    if (def.shareBoard) {
      const b = buildShareBoard();
      this.stallGroup.add(b.group);
      this.sharePlates = b.plates;
    }
    this.seesaw = null;
    if (def.seesawN) {
      this.seesaw = buildSeesaw();
      this.seesaw.setSign(null, def.unknown);
      this.stallGroup.add(this.seesaw.group);
    }
    def.vendors.forEach((v, i) => this.vendors.push(this.makeVendor(v.pos, v.tint, i)));
    this.lastChalk = '';
    this.dialTimer = 0;
    this.scales.forEach((r) => setDial(r, null));
    this.camYaw = 0;
    this.lastStall = game.stallIndex;
    this.snapCamera(game);
  }

  private makeVendor(pos: { x: number; z: number }, tint: number, index: number): VendorView {
    const root = new THREE.Group();
    root.position.set(pos.x, 0, pos.z);
    let model: THREE.Object3D;
    let mixer: THREE.AnimationMixer | null = null;
    const actions: VendorView['actions'] = {};
    if (this.models.vendor) {
      model = SkeletonUtils.clone(this.models.vendor);
      normalize(model, 1.78);
      if (tint !== 0xffffff) {
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.material = (m.material as THREE.MeshStandardMaterial).clone();
            (m.material as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(tint));
          }
        });
      }
      const clips = this.models.vendorClips;
      if (clips.length) {
        mixer = new THREE.AnimationMixer(model);
        const pick: Record<string, string[]> = {
          away: ['sing', 'idle'],
          warning: ['look_around', 'look', 'idle'],
          looking: ['idle', 'standing', 'wait'],
          distracted: ['look_around', 'idle'],
          shooing: ['angry', 'complain', 'idle'],
          happy: ['clap', 'cheer', 'laugh', 'idle'],
          asleep: ['sit', 'idle'],
        };
        for (const [mode, names] of Object.entries(pick)) {
          const c = findClip(clips, ...names);
          if (c) actions[mode] = mixer.clipAction(c);
        }
      }
    } else {
      model = fallbackVendor(tint);
    }
    root.add(model);
    const bubbles: Record<string, THREE.Sprite> = {
      away: bubbleSprite('♪', '#fff6df'),
      warning: bubbleSprite('?', '#ffd36b'),
      looking: bubbleSprite('👁', '#ff9a6b'),
      distracted: bubbleSprite('?!', '#cfe8ff'),
      shooing: bubbleSprite('!', '#ff6b4a'),
      happy: bubbleSprite('★', '#ffe08a'),
      asleep: bubbleSprite('z', '#dfe7ff'),
    };
    for (const b of Object.values(bubbles)) {
      b.position.y = 2.25;
      b.visible = false;
      root.add(b);
    }
    // vision cone on the floor (shows where the vendor is looking)
    const cone = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 24, -0.42, 0.84),
      new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.0, depthWrite: false }),
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.y = 0.02;
    this.stallGroup.add(cone);
    cone.position.set(pos.x, 0.02, pos.z);
    this.stallGroup.add(root);
    void index;
    return { root, model, mixer, actions, current: '', yaw: Math.PI, bubble: bubbles.away, bubbleKey: 'away', bubbles, cone };
  }

  // ---------------------------------------------------------------- per frame

  update(game: Game, dt: number) {
    this.time += dt;
    if (game.stallIndex !== this.lastStall) this.loadStall(game);
    this.syncGoose(game, dt);
    this.syncVendors(game, dt);
    this.syncScales(game, dt);
    this.syncItems(game, dt);
    this.syncProps(game, dt);
    this.syncParticles(dt);
    this.syncCamera(game, dt);
    if (this.env) for (const b of this.env.bulbs) b.material.opacity = 0.75 + Math.sin(this.time * 3 + b.position.x) * 0.1;
  }

  handleEvents(game: Game, events: GameEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'caught':
          this.shake = 0.45;
          this.dialTimer = 3.5;
          this.burst('feather', this.goose.position, 16);
          this.scales[0] && setDial(this.scales[0], e.diff === null ? 'x?' : String(e.diff));
          break;
        case 'honk':
          this.burst('honk', this.goose.position, 6);
          break;
        case 'share':
          this.shake = 0.12;
          this.burst('dust', new THREE.Vector3(game.def.scales[0].pos.x, 0.3, game.def.scales[0].pos.z + 1.5), 14);
          break;
        case 'shareFail':
          this.shake = 0.15;
          break;
        case 'action':
          if (e.event === 'zero_pair' || e.event === 'bundle_split' || e.event === 'changed') this.burst('spark', this.goose.position, 10);
          break;
        case 'solved':
          this.burst('confetti', new THREE.Vector3(game.def.scales[0].pos.x, 2.2, game.def.scales[0].pos.z), 60);
          for (const id of (e.unknownIds as number[]) ?? []) this.killItem(id, new THREE.Vector3(0, 2.5, -2));
          this.seesaw?.setSign(game.def.seesawN, game.def.unknown);
          break;
        case 'launch':
          this.shake = 0.2;
          this.burst('dust', new THREE.Vector3(SEESAW.gooseEnd.x, 0.2, SEESAW.gooseEnd.z), 12);
          break;
        case 'splat':
          this.shake = 0.35;
          this.burst('tomato', this.goose.position, 26);
          break;
        case 'bonk':
          this.shake = 0.35;
          this.burst('feather', this.goose.position, 10);
          break;
        case 'stallDone':
          this.burst('confetti', this.goose.position.clone().add(new THREE.Vector3(0, 2, 0)), 50);
          break;
        case 'stampRight':
          this.burst('confetti', new THREE.Vector3(game.def.scales[e.scale as number].pos.x, 2.4, game.def.scales[e.scale as number].pos.z), 50);
          break;
        case 'land':
          this.burst('dust', this.goose.position, 5);
          break;
        case 'balanced':
          if (this.dialTimer > 0) this.dialTimer = 0.01;
          break;
      }
    }
  }

  private syncGoose(game: Game, dt: number) {
    const g = game.goose;
    const target = new THREE.Vector3(g.x, g.y, g.z);
    if (game.phase === 'flying' || game.phase === 'launching') this.goose.position.copy(target);
    else this.goose.position.lerp(target, Math.min(1, dt * 20));
    let dy = g.yaw - this.goose.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.goose.rotation.y += dy * Math.min(1, dt * 14);
    if (game.phase === 'flying') this.goose.rotation.x = Math.sin(this.time * 14) * 0.3;
    else this.goose.rotation.x *= 0.8;

    const body = this.gooseBody;
    const rm = this.reducedMotion ? 0.3 : 1;
    if (g.moving && g.y < 0.01) {
      this.walkPhase += dt * 11;
      body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06 * rm;
      body.rotation.z = Math.sin(this.walkPhase) * 0.14 * rm;
      if (Math.sin(this.walkPhase) * Math.sin(this.walkPhase - dt * 11) < 0) this.onStep?.();
    } else {
      body.position.y *= 0.8;
      body.rotation.z *= 0.8;
    }
    // honk: neck stretch squash; flap: wobble; stun: spin
    const honk = g.honkT > 0 ? Math.sin((1 - g.honkT / 0.5) * Math.PI) : 0;
    const flap = g.flapT > 0 ? Math.sin(this.time * 40) * 0.12 : 0;
    body.scale.set(1 - honk * 0.08 + flap, 1 + honk * 0.18, 1 - honk * 0.08 + flap);
    body.rotation.x = -honk * 0.25;
    if (g.stun > 0) body.rotation.y += dt * 18;
    else body.rotation.y *= 0.85;
    const blob = this.goose.getObjectByName('blob');
    if (blob) {
      blob.position.y = -g.y + 0.01;
      blob.scale.setScalar(Math.max(0.3, 1 - g.y * 0.15));
    }
    // neck: bob with each step, stretch forward on a honk, crane up when holding something
    if (!this.gooseMixer && this.neckBones.length) {
      const bob = g.moving ? Math.sin(this.walkPhase * 2) * 0.09 * rm : Math.sin(this.time * 1.6) * 0.03;
      const tilt = bob - honk * 0.22 + (g.stun > 0 ? Math.sin(this.time * 30) * 0.2 : 0);
      this.neckBones.forEach((b, i) => {
        b.quaternion.copy(this.neckRest[i]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)));
      });
    }
    if (this.gooseMixer) {
      const want = g.moving ? ['walk', 'run'] : ['idle'];
      const name = Object.keys(this.gooseActions).find((k) => want.some((w) => k.includes(w)));
      for (const [k, a] of Object.entries(this.gooseActions)) {
        if (k === name) {
          if (!a.isRunning()) a.reset().fadeIn(0.2).play();
        } else if (a.isRunning()) a.fadeOut(0.2);
      }
      this.gooseMixer.update(dt);
    }
  }

  onStep: (() => void) | null = null;

  private syncVendors(game: Game, dt: number) {
    game.vendors.forEach((v, i) => {
      const view = this.vendors[i];
      if (!view) return;
      const cfg = game.vcfgs[i];
      const toScale = Math.atan2(cfg.scalePos.x - cfg.pos.x, cfg.scalePos.z - cfg.pos.z);
      let want = view.yaw;
      const mode: VendorMode = v.mode;
      if (mode === 'away' || mode === 'asleep') want = toScale + Math.PI;
      else if (mode === 'warning') {
        // wind-up: a slow head turn from the shelves toward the scale
        const u = 1 - v.t / cfg.warn;
        want = toScale + Math.PI * (1 - Math.min(1, u * 1.15));
      } else if (mode === 'looking') want = toScale;
      else if (mode === 'distracted' && v.lookAt) want = Math.atan2(v.lookAt.x - cfg.pos.x, v.lookAt.z - cfg.pos.z);
      else if (mode === 'shooing') want = Math.atan2(game.goose.x - cfg.pos.x, game.goose.z - cfg.pos.z);
      else if (mode === 'happy') want = 0;
      let d = want - view.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const rate = mode === 'warning' ? 30 : mode === 'shooing' ? 14 : 7;
      view.yaw += d * Math.min(1, dt * rate);
      view.root.rotation.y = view.yaw;
      // little lunge when shooing
      const lunge = mode === 'shooing' ? Math.max(0, Math.sin((v.t / 2.4) * Math.PI)) * 0.5 : 0;
      view.root.position.set(cfg.pos.x + Math.sin(view.yaw) * lunge, mode === 'happy' && !view.mixer ? Math.abs(Math.sin(this.time * 8)) * 0.15 : 0, cfg.pos.z + Math.cos(view.yaw) * lunge);
      if (!view.mixer) {
        view.model.rotation.z = mode === 'away' ? Math.sin(this.time * 2) * 0.04 : 0;
      }
      // animation
      if (view.mixer) {
        const key = view.actions[mode] ? mode : 'looking';
        if (view.current !== key) {
          const next = view.actions[key];
          const prev = view.actions[view.current];
          if (next) {
            next.reset().fadeIn(0.25).play();
            prev?.fadeOut(0.25);
          }
          view.current = key;
        }
        view.mixer.update(dt);
      }
      // bubble
      if (view.bubbleKey !== mode) {
        view.bubble.visible = false;
        view.bubble = view.bubbles[mode] ?? view.bubbles.away;
        view.bubbleKey = mode;
      }
      view.bubble.visible = true;
      const pulse = mode === 'warning' ? 1 + Math.sin(this.time * 18) * 0.12 : mode === 'shooing' ? 1.25 : 1;
      view.bubble.scale.set(0.5 * pulse, 0.55 * pulse, 1);
      view.bubble.position.y = 2.2 + Math.sin(this.time * 3) * 0.04;
      // vision cone
      const watching = mode === 'looking' || mode === 'warning' || mode === 'shooing';
      const mat = view.cone.material as THREE.MeshBasicMaterial;
      const targetOpacity = mode === 'looking' || mode === 'shooing' ? 0.32 : mode === 'warning' ? 0.16 + Math.sin(this.time * 18) * 0.06 : 0.07;
      mat.opacity += (targetOpacity - mat.opacity) * Math.min(1, dt * 10);
      mat.color.set(watching ? (mode === 'warning' ? 0xffc24a : 0xff6a3d) : 0x9fd8ff);
      view.cone.rotation.z = view.yaw - Math.PI / 2;
      view.cone.visible = mode !== 'asleep' && mode !== 'happy';
    });
  }

  private syncScales(game: Game, dt: number) {
    game.stall.scales.forEach((sc, i) => {
      const rig = this.scales[i];
      if (!rig) return;
      const d = difference(sc);
      const target = d > 0 ? TILT : d < 0 ? -TILT : 0;
      // spring with a little wobble
      const k = 60;
      const c = 9;
      rig.vel += (k * (target - rig.angle) - c * rig.vel) * dt;
      rig.angle += rig.vel * dt;
      rig.beam.rotation.z = rig.angle;
      const L = 1.55;
      rig.pans.L.position.set(-Math.cos(rig.angle) * L, BEAM_Y - Math.sin(rig.angle) * L, 0);
      rig.pans.R.position.set(Math.cos(rig.angle) * L, BEAM_Y + Math.sin(rig.angle) * L, 0);
      // dial needle: shows the size of the difference only after the vendor reacted
      const showDial = this.dialTimer > 0 && i === 0;
      const needleTarget = showDial ? -Math.sign(d) * Math.min(1, Math.abs(d) / 6) * 1.1 : 0;
      rig.needle.rotation.z += (needleTarget - rig.needle.rotation.z) * Math.min(1, dt * 8);
      // chalk tag (hint)
      const showChalk = game.hintOn && game.def.hint;
      rig.chalk.visible = showChalk;
      (rig.chalk.userData.cords as THREE.Object3D).visible = showChalk;
      if (showChalk) {
        const text = equationString(sc);
        if (text !== this.lastChalk + i) {
          rig.setChalk(text);
          this.lastChalk = text + i;
        }
        rig.chalk.quaternion.copy(this.camera.quaternion);
      }
    });
    if (this.dialTimer > 0) {
      this.dialTimer -= dt;
      if (this.dialTimer <= 0 && this.scales[0]) setDial(this.scales[0], null);
    }
  }

  private itemTargets(game: Game): Map<number, { pos: THREE.Vector3; item: Item; rotY: number }> {
    const out = new Map<number, { pos: THREE.Vector3; item: Item; rotY: number }>();
    const s = game.stall;
    const tmp = new THREE.Vector3();
    s.scales.forEach((sc, si) => {
      const rig = this.scales[si];
      if (!rig) return;
      for (const side of ['L', 'R'] as Side[]) {
        const list = sc[side];
        rig.trays[side].getWorldPosition(tmp);
        list.forEach((it, i) => {
          const slot = panSlot(i, list.length);
          out.set(it.id, { pos: new THREE.Vector3(tmp.x + slot.x, tmp.y, tmp.z + slot.z), item: it, rotY: 0 });
        });
      }
    });
    s.ground.forEach((it) => {
      const p = it.pos ?? START;
      out.set(it.id, { pos: new THREE.Vector3(p.x, 0, p.z), item: it, rotY: (it.id * 0.7) % 1 - 0.5 });
    });
    if (this.supplyAnchor) {
      this.supplyAnchor.getWorldPosition(tmp);
      s.supply.forEach((it, i) => {
        out.set(it.id, { pos: new THREE.Vector3(tmp.x - 0.3 + (i % 3) * 0.3, tmp.y, tmp.z - 0.15 + Math.floor(i / 3) * 0.3), item: it, rotY: 0 });
      });
    }
    if (this.seesaw) {
      this.seesaw.bucket.getWorldPosition(tmp);
      s.seesaw.forEach((it, i) => {
        const a = (i / Math.max(1, s.seesaw.length)) * Math.PI * 2;
        const r = s.seesaw.length > 1 ? 0.18 : 0;
        out.set(it.id, { pos: new THREE.Vector3(tmp.x + Math.cos(a) * r, tmp.y + 0.04 + Math.floor(i / 6) * 0.2, tmp.z + Math.sin(a) * r), item: it, rotY: 0 });
      });
    }
    if (s.beak) {
      const p = new THREE.Vector3(0, 0.36, 0.5).applyMatrix4(this.goose.matrixWorld);
      out.set(s.beak.id, { pos: p, item: s.beak, rotY: this.goose.rotation.y });
    }
    return out;
  }

  private syncItems(game: Game, dt: number) {
    this.goose.updateMatrixWorld(true);
    const targets = this.itemTargets(game);
    // remove missing
    for (const [id, obj] of this.items) {
      const t = targets.get(id);
      if (!t || obj.userData.kind !== t.item.kind || (t.item.kind === 'bundle' && obj.userData.parts !== (t.item.parts ?? []).join())) {
        if (!t && game.stall.sky.some((it) => it.id === id)) this.killItem(id, new THREE.Vector3(0, 3, 0));
        else {
          obj.removeFromParent();
          this.items.delete(id);
        }
      }
    }
    const beakId = game.stall.beak?.id;
    for (const [id, t] of targets) {
      let obj = this.items.get(id);
      if (!obj) {
        obj = itemMesh(t.item, { sack: this.models.sack, jar: this.models.jar });
        obj.userData.kind = t.item.kind;
        obj.userData.parts = (t.item.parts ?? []).join();
        obj.position.copy(t.pos);
        this.scene.add(obj);
        this.items.set(id, obj);
        obj.scale.setScalar(0.01);
      }
      const held = id === beakId;
      const k = Math.min(1, dt * (held ? 22 : 12));
      const arc = obj.position.distanceTo(t.pos) > 0.3 && !held ? 0.25 : 0;
      obj.position.lerp(t.pos, k);
      obj.position.y += arc * k;
      obj.rotation.y += (t.rotY - obj.rotation.y) * k;
      const sc = obj.scale.x + (1 - obj.scale.x) * Math.min(1, dt * 10);
      obj.scale.setScalar(sc);
      // floating zero pair and balloons bob
      if (obj.userData.floatChild) (obj.userData.floatChild as THREE.Object3D).position.y = 0.16 + Math.sin(this.time * 2.5 + id) * 0.04;
      if (t.item.kind === 'balloon' || t.item.kind === 'pair') obj.rotation.z = Math.sin(this.time * 1.7 + id) * 0.06;
      // rigged scale bonus: the sacks "change" weight but the scale stays put
      if (game.def.bonus && (t.item.kind === 'sack') && !held) {
        const s2 = 1 + Math.sin(this.time * 1.3 + (id % 2) * 0.0) * 0.18;
        obj.scale.set(s2, s2, s2);
      }
    }
    // dying items (taken by the vendor / floating away)
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t -= dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.scale.multiplyScalar(d.t < 0.4 ? 0.9 : 1);
      if (d.t <= 0) {
        d.obj.removeFromParent();
        this.dying.splice(i, 1);
      }
    }
    // interaction highlight
    const it = game.interaction();
    this.highlight.visible = false;
    this.plateGlow.visible = false;
    if (it && (game.phase === 'play' || game.phase === 'solved')) {
      if (it.kind === 'grab' && !game.stall.beak) {
        const mesh = this.findTargetMesh(game);
        if (mesh) {
          this.highlight.visible = true;
          this.highlight.position.set(mesh.position.x, mesh.position.y + 0.02, mesh.position.z);
          this.highlight.scale.setScalar(1.6 + Math.sin(this.time * 8) * 0.15);
        }
      } else if (it.kind === 'share' || it.kind === 'stamp') {
        const g = game.goose;
        const p = it.kind === 'share' ? SHARE_PLATES.reduce((a, b) => (Math.hypot(g.x - a.x, g.z - a.z) < Math.hypot(g.x - b.x, g.z - b.z) ? a : b)) : { x: g.x, z: g.z };
        this.plateGlow.visible = true;
        this.plateGlow.position.set(p.x, 0.12, p.z);
        (this.plateGlow.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(this.time * 6) * 0.12;
      }
    }
  }

  private findTargetMesh(game: Game): THREE.Object3D | null {
    const pan = game.nearestPan();
    if (pan && game.stall.scales[pan.scale][pan.side].length) {
      const item = game.pickOnPan(pan.scale, pan.side);
      return this.items.get(item.id) ?? null;
    }
    let best: THREE.Object3D | null = null;
    let bd = 1.25;
    for (const it of [...game.stall.ground, ...game.stall.supply, ...game.stall.seesaw]) {
      const o = this.items.get(it.id);
      if (!o) continue;
      const d = Math.hypot(o.position.x - game.goose.x, o.position.z - game.goose.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  killItem(id: number, vel: THREE.Vector3) {
    const obj = this.items.get(id);
    if (!obj) return;
    this.items.delete(id);
    this.dying.push({ obj, t: 1.4, vel });
  }

  private syncProps(game: Game, dt: number) {
    if (this.seesaw) {
      const s = this.seesaw;
      const load = game.stall.seesaw.length;
      let want = load ? -0.2 : 0.2; // bucket end down when loaded, goose end down when empty
      if (game.phase === 'flying' && game.flight) want = game.flight.outcome === 'short' ? -0.05 : 0.25;
      s.angle += (want - s.angle) * Math.min(1, dt * (game.phase === 'flying' ? 20 : 6));
      s.plank.rotation.z = s.angle;
    }
    this.sharePlates.forEach((p) => {
      const g = game.goose;
      const on = Math.abs(g.x - p.position.x) < PLATE_HALF && Math.abs(g.z - p.position.z) < PLATE_HALF;
      p.position.y += ((on ? 0.04 : 0.07) - p.position.y) * Math.min(1, dt * 12);
    });
    this.stallGroup.traverse((o) => {
      if (o.userData.billboard) o.quaternion.copy(this.camera.quaternion);
    });
  }

  // ---------------------------------------------------------------- particles

  burst(kind: 'feather' | 'dust' | 'spark' | 'confetti' | 'honk' | 'tomato', at: THREE.Vector3, n: number) {
    if (this.reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      let obj: THREE.Object3D;
      const vel = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3);
      let gravity = 6;
      let life = 1.2;
      let fade = true;
      if (kind === 'feather') {
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.featherTex, transparent: true, rotation: Math.random() * 6 }));
        obj.scale.set(0.12, 0.24, 1);
        gravity = 1.2;
        life = 2;
        vel.multiplyScalar(0.8);
      } else if (kind === 'confetti') {
        const colors = [0xe8352b, 0xf2c14e, 0x2f8f83, 0xffffff, 0x7b3fa0];
        obj = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.12), new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
        vel.set((Math.random() - 0.5) * 6, Math.random() * 5 + 2, (Math.random() - 0.5) * 6);
        gravity = 4;
        life = 2.2;
      } else if (kind === 'dust') {
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xd9c19a, transparent: true, opacity: 0.6, depthWrite: false }));
        obj.scale.setScalar(0.4);
        vel.set((Math.random() - 0.5) * 2, Math.random() * 0.8, (Math.random() - 0.5) * 2);
        gravity = -0.2;
        life = 0.8;
      } else if (kind === 'tomato') {
        obj = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshStandardMaterial({ color: 0xd8321f }));
        vel.multiplyScalar(1.6);
        gravity = 9;
        life = 1.2;
        fade = false;
      } else if (kind === 'honk') {
        obj = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        obj.position.y = 0.7;
        vel.set(0, 0, 0);
        gravity = 0;
        life = 0.6 + i * 0.08;
        obj.userData.grow = 6 + i;
      } else {
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        obj.scale.setScalar(0.25);
        gravity = 2;
        life = 0.7;
      }
      obj.position.add(at).add(new THREE.Vector3(0, kind === 'honk' ? 0.7 : 0.5, 0));
      this.scene.add(obj);
      this.particles.push({ obj, vel, life, max: life, spin: (Math.random() - 0.5) * 8, gravity, fade });
    }
  }

  private syncParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.obj.userData.grow) {
        p.obj.scale.addScalar(p.obj.userData.grow * dt);
        p.obj.quaternion.copy(this.camera.quaternion);
      } else if ((p.obj as THREE.Mesh).isMesh) {
        p.obj.rotation.x += p.spin * dt;
        p.obj.rotation.y += p.spin * dt * 0.7;
      }
      const mat = (p.obj as THREE.Mesh).material as THREE.Material & { opacity: number };
      if (p.fade && mat) mat.opacity = Math.max(0, p.life / p.max);
      if (p.obj.position.y < 0.02 && p.gravity > 0) {
        p.obj.position.y = 0.02;
        p.vel.multiplyScalar(0.3);
      }
      if (p.life <= 0) {
        p.obj.removeFromParent();
        this.particles.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- camera

  private desiredCamera(game: Game): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const aspect = this.camera.aspect;
    const g = this.goose.position;
    const target = new THREE.Vector3(g.x, 0.9, g.z);
    if (this.titleMode) {
      const sc = game.def.scales[0].pos;
      const a = this.time * 0.12;
      const t = new THREE.Vector3(sc.x - 0.6, 1.4, sc.z);
      return { pos: new THREE.Vector3(sc.x + Math.sin(a) * 2 - 1.5, 2.2, sc.z + 6.2 + Math.cos(a) * 0.6), target: t };
    }
    // frame the scale when near it
    let best = Infinity;
    for (const sc of game.def.scales) {
      const d = Math.hypot(g.x - sc.pos.x, g.z - sc.pos.z);
      if (d < best) {
        best = d;
        const w = Math.max(0, Math.min(1, (5.5 - d) / 3)) * 0.7;
        target.lerp(new THREE.Vector3(sc.pos.x, 1.3, sc.pos.z - 0.3), w);
      }
    }
    if (game.phase === 'flying') target.y = g.y + 1;
    const portrait = aspect < 1;
    const dist = portrait ? 8.6 : aspect < 1.5 ? 6.6 : 5.7;
    const height = portrait ? 5.2 : 3.1;
    const off = new THREE.Vector3(Math.sin(this.camYaw) * dist, height, Math.cos(this.camYaw) * dist);
    return { pos: target.clone().add(off), target };
  }

  snapCamera(game: Game) {
    const d = this.desiredCamera(game);
    this.camPos.copy(d.pos);
    this.camTarget.copy(d.target);
  }

  private syncCamera(game: Game, dt: number) {
    const d = this.desiredCamera(game);
    const k = Math.min(1, dt * (this.titleMode ? 2 : 4));
    this.camPos.lerp(d.pos, k);
    this.camTarget.lerp(d.target, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0 && !this.reducedMotion) {
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
      this.shake = Math.max(0, this.shake - dt * 1.4);
    } else this.shake = 0;
    this.camera.lookAt(this.camTarget);
    this.sun.position.set(this.camTarget.x - 7, 11, this.camTarget.z + 6);
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);
  }

  // ---------------------------------------------------------------- picking

  pick(ndc: THREE.Vector2, game: Game): { itemId?: number; pan?: { scale: number; side: Side } } | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const objs = [...this.items.values()];
    const hits = ray.intersectObjects(objs, true);
    if (hits.length) {
      const id = hits[0].object.userData.itemId as number | undefined;
      if (id !== undefined) return { itemId: id };
    }
    const panObjs: THREE.Object3D[] = [];
    this.scales.forEach((r) => panObjs.push(r.pans.L, r.pans.R));
    const ph = ray.intersectObjects(panObjs, true);
    if (ph.length) {
      for (let si = 0; si < this.scales.length; si++) {
        for (const side of ['L', 'R'] as Side[]) {
          let o: THREE.Object3D | null = ph[0].object;
          while (o) {
            if (o === this.scales[si].pans[side]) return { pan: { scale: si, side } };
            o = o.parent;
          }
        }
      }
    }
    void game;
    return null;
  }

  isBalancedNow(game: Game) {
    return isBalanced(game.scale);
  }
}

function normalize(model: THREE.Object3D, height: number) {
  model.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(model);
  const size = bb.getSize(new THREE.Vector3());
  const s = height / (size.y || 1);
  model.scale.multiplyScalar(s);
  model.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(model);
  const c = bb2.getCenter(new THREE.Vector3());
  model.position.x -= c.x;
  model.position.z -= c.z;
  model.position.y -= bb2.min.y;
}

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#7fb2d9');
  grd.addColorStop(0.55, '#f4d6a8');
  grd.addColorStop(1, '#f2b77c');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fallbackGoose(): THREE.Object3D {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.8 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf08a1c, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14).scale(1, 0.85, 1.25), white);
  body.position.y = 0.32;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.36, 10), white);
  neck.position.set(0, 0.56, 0.18);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), white);
  head.position.set(0, 0.76, 0.2);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 10), orange);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.74, 0.33);
  g.add(body, neck, head, beak);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16), orange);
    leg.position.set(s * 0.08, 0.08, 0);
    g.add(leg);
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
  return g;
}

function fallbackVendor(tint: number): THREE.Object3D {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x9fc3e8).multiply(new THREE.Color(tint)) });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0a77c });
  const apron = new THREE.MeshStandardMaterial({ color: 0x7a4a2a });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.6, 6, 14), shirt);
  body.position.y = 0.95;
  const ap = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.4, 6, 14, 1), apron);
  ap.scale.set(0.95, 1, 0.6);
  ap.position.set(0, 0.85, 0.12);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), skin);
  head.position.y = 1.58;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x4a4a4a }));
  cap.position.set(0, 1.78, 0.04);
  g.add(body, ap, head, cap);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
  return g;
}
