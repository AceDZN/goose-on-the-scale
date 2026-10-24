// Procedural shuk geometry: the stall, the exact brass scale, weights, balloons, change box,
// share board, seesaw. Math-critical shapes are built here, never from generated meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Item } from './rules.ts';
import type { StallDef } from './levels.ts';
import {
  CHANGE_BOX,
  COUNTER,
  FLOOR,
  PAN_OFFSET,
  PAN_RADIUS,
  SEESAW,
  SHARE_PLATES,
  SUPPLY,
  WALL_X,
  stampPlates,
} from './layout.ts';
import {
  bubbleTexture,
  chalkTexture,
  drawChalk,
  glowTexture,
  paverTexture,
  signTexture,
  stripeTexture,
  wallTexture,
  weightLabel,
  woodTexture,
} from './textures.ts';

export const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9953b, metalness: 0.85, roughness: 0.32 });
const BRASS_DARK = new THREE.MeshStandardMaterial({ color: 0x8c6424, metalness: 0.8, roughness: 0.4 });
const IRON = new THREE.MeshStandardMaterial({ color: 0x2c2b2e, metalness: 0.55, roughness: 0.55 });
const CREAM = new THREE.MeshStandardMaterial({ color: 0xf3e6c4, roughness: 0.8 });

let woodMat: THREE.MeshStandardMaterial | null = null;
function wood() {
  woodMat ??= new THREE.MeshStandardMaterial({ map: woodTexture(3), roughness: 0.85 });
  return woodMat;
}
let darkWoodMat: THREE.MeshStandardMaterial | null = null;
function darkWood() {
  darkWoodMat ??= new THREE.MeshStandardMaterial({ map: woodTexture(9, '#5e3a1e'), roughness: 0.9 });
  return darkWoodMat;
}

function shadowy<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/**
 * Static batching: merge every plain mesh under `root` that shares a material into one mesh,
 * baked into root's local space. Cuts hundreds of draw calls (chain links, spice cones, bulbs).
 */
export function mergeStatic(root: THREE.Object3D, skip?: (m: THREE.Mesh) => boolean) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  const remove: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh || skip?.(m)) return;
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, geos: [], cast: m.castShadow, receive: m.receiveShadow }));
    b.geos.push(g);
    remove.push(m);
  });
  for (const m of remove) m.removeFromParent();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    root.add(mesh);
  }
}

// ------------------------------------------------------------------ environment

export interface Environment {
  group: THREE.Group;
  bulbs: THREE.Sprite[];
  awnings: THREE.Mesh[];
}

const GOODS_COLORS: Record<StallDef['goods'], number[]> = {
  melon: [0x2f7a32, 0x3f8f3a],
  pomegranate: [0xb3242c, 0x8f1c25],
  citrus: [0xf2a01f, 0xf7c82f],
  nuts: [0x9b6a3c, 0xc79a5e],
  pita: [0xe8c58a, 0xd6a861],
  olives: [0x4a5a22, 0x2e3a14],
  spice: [0xd2481f, 0xe9a21c],
  rugs: [0x7a2a5a, 0x2a4a8a],
};

export function buildEnvironment(def: StallDef): Environment {
  const g = new THREE.Group();
  const bulbs: THREE.Sprite[] = [];
  const awnings: THREE.Mesh[] = [];

  // floor
  const floorTex = paverTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR.maxX - FLOOR.minX + 12, FLOOR.maxZ - FLOOR.minZ + 14),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92 }),
  );
  floorTex.repeat.set(5, 4.5);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 1);
  floor.receiveShadow = true;
  g.add(floor);

  // walls: left, right (the seesaw jumps over this one), back
  const wTex = wallTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: wTex, roughness: 0.95 });
  const sideWall = (x: number, h: number) => {
    const m = box(0.7, h, 12, wallMat, x, h / 2, 0.2);
    const t = wTex.clone();
    t.needsUpdate = true;
    t.repeat.set(3, h / 2.2);
    m.material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    return shadowy(m);
  };
  g.add(sideWall(-FLOOR.maxX - 0.6, 3.4));
  g.add(sideWall(WALL_X + 0.35, 2.6));
  // cap stones on the jump wall
  for (let z = -5.5; z < 6; z += 0.9) g.add(shadowy(box(0.9, 0.18, 0.86, CREAM, WALL_X + 0.35, 2.68, z + 0.45)));
  const back = box(18, 5, 0.6, new THREE.MeshStandardMaterial({ map: (() => { const t = wTex.clone(); t.needsUpdate = true; t.repeat.set(4, 2.2); return t; })(), roughness: 0.95 }), 0, 2.5, -6.3);
  g.add(shadowy(back, false, true));

  // vendor stall: counter, shelves with goods, awning
  const counterTop = box(COUNTER.maxX - COUNTER.minX + 0.2, 0.1, 0.8, darkWood(), 0, 0.95, (COUNTER.minZ + COUNTER.maxZ) / 2);
  const counterBody = box(COUNTER.maxX - COUNTER.minX, 0.9, 0.6, wood(), 0, 0.45, (COUNTER.minZ + COUNTER.maxZ) / 2);
  g.add(shadowy(counterTop), shadowy(counterBody));

  const shelfMat = darkWood();
  for (let i = 0; i < 3; i++) {
    g.add(shadowy(box(11, 0.08, 0.7, shelfMat, 0, 0.7 + i * 0.75, -5.3)));
  }
  for (const x of [-5.5, -1.8, 1.8, 5.5]) g.add(shadowy(box(0.12, 2.4, 0.7, shelfMat, x, 1.2, -5.3)));

  // spice pyramids and jars on shelves
  const spiceColors = [0xd2481f, 0xe9a21c, 0x7d9a2f, 0xb83a1b, 0xf0c74a, 0x8e3b23, 0xc9772c];
  let k = 0;
  for (let s = 0; s < 3; s++) {
    for (let x = -5.1; x < 5.2; x += 0.62) {
      const col = spiceColors[k++ % spiceColors.length];
      if ((k + s) % 3 === 0) {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 12), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, transparent: true, opacity: 0.92 }));
        jar.position.set(x, 0.88 + s * 0.75, -5.25);
        g.add(jar);
      } else {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.36, 18), new THREE.MeshStandardMaterial({ color: col, roughness: 1 }));
        cone.position.set(x, 0.92 + s * 0.75, -5.25);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.08, 18), BRASS_DARK);
        bowl.position.set(x, 0.78 + s * 0.75, -5.25);
        g.add(cone, bowl);
      }
    }
  }

  // goods crates on both sides of the counter
  const [ga, gb] = GOODS_COLORS[def.goods];
  const crate = (x: number, z: number, rot = 0) => {
    const c = new THREE.Group();
    c.add(box(1.1, 0.5, 0.8, wood(), 0, 0.25, 0));
    const fruitMat = [new THREE.MeshStandardMaterial({ color: ga, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: gb, roughness: 0.6 })];
    const big = def.goods === 'melon';
    const r = big ? 0.2 : 0.11;
    for (let i = 0; i < (big ? 6 : 16); i++) {
      const f = new THREE.Mesh(big ? new THREE.SphereGeometry(r, 14, 10).scale(1, 0.85, 1.25) : new THREE.SphereGeometry(r, 10, 8), fruitMat[i % 2]);
      const cols = big ? 3 : 5;
      f.position.set(-0.36 + (i % cols) * (0.72 / (cols - 1)), 0.52 + Math.floor(i / (cols * 2)) * r, -0.22 + (Math.floor(i / cols) % 2) * 0.42);
      c.add(f);
    }
    c.position.set(x, 0, z);
    c.rotation.y = rot;
    return shadowy(c);
  };
  g.add(crate(-5.2, -2.4, 0.15), crate(-6.4, -1.0, -0.3), crate(5.6, -2.3, -0.1), crate(-6.5, 4.6, 0.4));
  // tomato crate in front of the jump wall (the short-launch landing spot)
  const tomatoes = crate(7.0, 4.6, 0);
  tomatoes.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry.type === 'SphereGeometry') m.material = new THREE.MeshStandardMaterial({ color: 0xd8321f, roughness: 0.5 });
  });
  g.add(tomatoes);

  // striped awning over the stall
  const aw = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.2, 1, 1), new THREE.MeshStandardMaterial({ map: stripeTexture(def.awning[0], def.awning[1], 14), side: THREE.DoubleSide, roughness: 0.9 }));
  aw.position.set(0, 3.55, -3.7);
  aw.rotation.x = -Math.PI / 2 + 0.38;
  shadowy(aw, true, false);
  g.add(aw);
  awnings.push(aw);
  // scalloped valance
  const val = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.35), new THREE.MeshStandardMaterial({ map: stripeTexture(def.awning[0], def.awning[1], 14), side: THREE.DoubleSide }));
  val.position.set(0, 2.92, -2.2);
  g.add(val);
  for (const x of [-4.9, 4.9]) g.add(shadowy(box(0.12, 3.6, 0.12, darkWood(), x, 1.8, -2.2)));

  // string lights
  const glow = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
  const strand = (a: THREE.Vector3, b: THREE.Vector3, n: number, sag: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)));
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2018 })));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag - 0.08, 0));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bulbMat);
      bulb.position.copy(p);
      const s = new THREE.Sprite(glow);
      s.position.copy(p);
      s.scale.setScalar(0.55);
      g.add(bulb, s);
      bulbs.push(s);
    }
  };
  strand(new THREE.Vector3(-4.9, 3.0, -2.15), new THREE.Vector3(4.9, 3.0, -2.15), 12, 0.35);
  strand(new THREE.Vector3(-FLOOR.maxX - 0.3, 3.3, 2.2), new THREE.Vector3(WALL_X, 2.75, 2.6), 10, 0.6);

  // potted plants with bougainvillea
  const pot = (x: number, z: number, s = 1) => {
    const p = new THREE.Group();
    p.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.24 * s, 0.5 * s, 14), new THREE.MeshStandardMaterial({ color: 0xb4643a, roughness: 0.9 })));
    p.children[0].position.y = 0.25 * s;
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a32, roughness: 0.9 });
    const bloom = new THREE.MeshStandardMaterial({ color: 0xe0559a, roughness: 0.8 });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 * s, 0), i % 3 ? leaf : bloom);
      b.position.set(Math.cos(i) * 0.22 * s, 0.6 * s + (i % 3) * 0.14 * s, Math.sin(i * 1.7) * 0.22 * s);
      p.add(b);
    }
    p.position.set(x, 0, z);
    return shadowy(p);
  };
  g.add(pot(-7.0, -4.2, 1.2), pot(7.1, -4.4, 1.1), pot(-7.1, 2.6, 0.9));

  // hanging garlic and chili strands on the stall posts
  for (const x of [-4.75, 4.75]) {
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf0ead8 : 0xb8261c, roughness: 0.8 }));
      c.position.set(x + (i % 2 ? 0.05 : -0.05), 2.6 - i * 0.16, -2.05);
      g.add(c);
    }
  }

  // small decorative pieces don't need to cast shadows
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.geometry.type === 'ConeGeometry' || (m.geometry.type === 'SphereGeometry' && (m.geometry as THREE.SphereGeometry).parameters.radius < 0.12))) m.castShadow = false;
  });
  mergeStatic(g, (m) => awnings.includes(m));
  return { group: g, bulbs, awnings };
}

// ------------------------------------------------------------------ scale

export interface ScaleRig {
  group: THREE.Group;
  beam: THREE.Group;
  pans: { L: THREE.Group; R: THREE.Group };
  /** Item containers that stay level on each pan. */
  trays: { L: THREE.Group; R: THREE.Group };
  needle: THREE.Mesh;
  dialLabel: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  chalk: THREE.Mesh;
  setChalk(text: string): void;
  angle: number;
  vel: number;
}

export const BEAM_Y = 2.3;
const HANG = 1.72;

export function buildScale(): ScaleRig {
  const group = new THREE.Group();
  const lathe = (pts: [number, number][], mat: THREE.Material, seg = 32) =>
    new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), mat);

  const base = lathe(
    [
      [0, 0],
      [0.62, 0],
      [0.62, 0.06],
      [0.5, 0.12],
      [0.38, 0.16],
      [0.3, 0.26],
      [0.12, 0.3],
      [0, 0.3],
    ],
    BRASS,
  );
  group.add(base);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, BEAM_Y - 0.3, 18), BRASS);
  post.position.y = 0.3 + (BEAM_Y - 0.3) / 2;
  group.add(post);
  for (const y of [0.55, 1.0, 1.9]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 24), BRASS_DARK);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  }
  // fulcrum cap and top finial
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), BRASS);
  cap.position.y = BEAM_Y;
  group.add(cap);
  const fin = lathe(
    [
      [0, 0],
      [0.06, 0.02],
      [0.03, 0.16],
      [0.07, 0.22],
      [0, 0.34],
    ],
    BRASS,
    16,
  );
  fin.position.y = BEAM_Y + 0.1;
  group.add(fin);

  // dial with needle (shows the difference only after the vendor reacts)
  const dial = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), new THREE.MeshStandardMaterial({ color: 0xf6edd6, roughness: 0.7 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.03, 8, 32), BRASS);
  const dc = document.createElement('canvas');
  dc.width = 256;
  dc.height = 256;
  const dtex = new THREE.CanvasTexture(dc);
  dtex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.CircleGeometry(0.235, 32), new THREE.MeshBasicMaterial({ map: dtex, transparent: true }));
  label.position.z = 0.002;
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.01), new THREE.MeshStandardMaterial({ color: 0xb8261c }));
  needle.geometry.translate(0, 0.09, 0);
  needle.position.z = 0.01;
  dial.add(face, label, rim, needle);
  dial.position.set(0, 1.42, 0.12);
  group.add(dial);

  // beam
  const beam = new THREE.Group();
  beam.position.y = BEAM_Y;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, PAN_OFFSET * 2 + 0.2, 14), BRASS);
  bar.rotation.z = Math.PI / 2;
  beam.add(bar);
  // decorative scrolls on the beam
  for (const s of [-1, 1]) {
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 24, Math.PI * 1.4), BRASS);
    scroll.position.set(s * 0.55, 0.12, 0);
    scroll.rotation.z = s > 0 ? Math.PI * 0.9 : -Math.PI * 0.3;
    beam.add(scroll);
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), BRASS);
    end.position.set(s * (PAN_OFFSET + 0.1), 0, 0);
    beam.add(end);
  }
  group.add(beam);

  const makePan = (side: 'L' | 'R') => {
    const hang = new THREE.Group();
    const bowl = lathe(
      [
        [0, -0.02],
        [PAN_RADIUS * 0.8, 0],
        [PAN_RADIUS, 0.08],
        [PAN_RADIUS + 0.02, 0.12],
        [PAN_RADIUS - 0.02, 0.12],
        [PAN_RADIUS * 0.78, 0.035],
        [0, 0.02],
      ],
      BRASS,
      40,
    );
    bowl.position.y = -HANG;
    hang.add(bowl);
    // chains: three from rim to hook
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const from = new THREE.Vector3(Math.cos(a) * (PAN_RADIUS - 0.02), -HANG + 0.12, Math.sin(a) * (PAN_RADIUS - 0.02));
      const to = new THREE.Vector3(0, -0.05, 0);
      const len = from.distanceTo(to);
      const links = Math.floor(len / 0.07);
      for (let j = 0; j < links; j++) {
        const p = new THREE.Vector3().lerpVectors(from, to, (j + 0.5) / links);
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 4, 8), BRASS_DARK);
        link.position.copy(p);
        link.lookAt(to);
        link.rotation.z += j % 2 ? Math.PI / 2 : 0;
        hang.add(link);
      }
    }
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), BRASS);
    hook.position.y = -0.02;
    hang.add(hook);
    mergeStatic(hang);
    hang.position.set(side === 'L' ? -PAN_OFFSET : PAN_OFFSET, BEAM_Y, 0);
    const tray = new THREE.Group();
    tray.position.y = -HANG + 0.03;
    hang.add(tray);
    group.add(hang);
    return { hang, tray };
  };
  const l = makePan('L');
  const r = makePan('R');

  const chalkTex = chalkTexture('');
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), new THREE.MeshBasicMaterial({ map: chalkTex, transparent: true }));
  chalk.position.set(0, BEAM_Y + 0.82, 0.05);
  const chalkCords = new THREE.Group();
  for (const s of [-1, 1]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.38), new THREE.MeshBasicMaterial({ color: 0x3b2a1a }));
    cord.position.set(s * 0.45, BEAM_Y + 0.42 + 0.16, 0.04);
    cord.rotation.z = s * -0.5;
    chalkCords.add(cord);
  }
  chalk.userData.cords = chalkCords;
  group.add(chalk, chalkCords);

  shadowy(group, true, true);
  chalk.castShadow = false;

  const rig: ScaleRig = {
    group,
    beam,
    pans: { L: l.hang, R: r.hang },
    trays: { L: l.tray, R: r.tray },
    needle,
    dialLabel: { canvas: dc, tex: dtex },
    chalk,
    angle: 0,
    vel: 0,
    setChalk(text: string) {
      const map = (chalk.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture;
      const c = map.image as HTMLCanvasElement;
      drawChalk(c.getContext('2d')!, text, c.width, c.height);
      map.needsUpdate = true;
    },
  };
  setDial(rig, null);
  return rig;
}

export function setDial(rig: ScaleRig, value: string | null) {
  const { canvas, tex } = rig.dialLabel;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = '#3b2a1a';
  g.lineWidth = 4;
  for (let i = -5; i <= 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * 1.1;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100);
    g.lineTo(128 + Math.cos(a) * (i === 0 ? 76 : 86), 128 + Math.sin(a) * (i === 0 ? 76 : 86));
    g.stroke();
  }
  if (value !== null) {
    g.fillStyle = '#b8261c';
    g.font = '800 72px Rubik, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'ltr';
    g.fillText(value, 128, 168);
  }
  tex.needsUpdate = true;
}

// ------------------------------------------------------------------ items

export interface ItemModels {
  sack: THREE.Object3D | null;
  jar: THREE.Object3D | null;
}

const blockSize: Record<number, { r: number; h: number }> = {
  1: { r: 0.13, h: 0.19 },
  2: { r: 0.16, h: 0.23 },
  5: { r: 0.2, h: 0.29 },
  10: { r: 0.24, h: 0.34 },
};

const labelCache = new Map<number, THREE.MeshBasicMaterial>();
function labelMat(v: number) {
  let m = labelCache.get(v);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: weightLabel(v) });
    labelCache.set(v, m);
  }
  return m;
}

const blockGeoCache = new Map<number, { iron: THREE.BufferGeometry; band: THREE.BufferGeometry; h: number }>();

function blockGeometry(value: number) {
  let c = blockGeoCache.get(value);
  if (c) return c;
  const { r, h } = blockSize[value] ?? blockSize[1];
  const body = new THREE.CylinderGeometry(r * 0.92, r, h, 20).translate(0, h / 2, 0);
  const shoulder = new THREE.CylinderGeometry(r * 0.55, r * 0.92, h * 0.22, 20).translate(0, h + h * 0.11, 0);
  const knob = new THREE.SphereGeometry(r * 0.38, 12, 8).translate(0, h * 1.32, 0);
  const iron = mergeGeometries([body, shoulder, knob].map((g) => g.toNonIndexed()), false)!;
  const band = new THREE.CylinderGeometry(r * 0.965, r * 1.005, h * 0.62, 20, 1, true, -Math.PI * 0.42, Math.PI * 0.84).translate(0, h * 0.5, 0);
  c = { iron, band, h };
  blockGeoCache.set(value, c);
  return c;
}

export function blockMesh(value: number): THREE.Group {
  const geo = blockGeometry(value);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo.iron, IRON), new THREE.Mesh(geo.band, labelMat(value)));
  g.userData.height = geo.h * 1.45;
  return shadowy(g);
}

function balloonMesh(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16).scale(1, 1.15, 1), new THREE.MeshStandardMaterial({ color: 0xe8352b, roughness: 0.25, metalness: 0.05 }));
  ball.position.y = 0.95;
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 8), ball.material);
  knot.position.y = 0.7;
  knot.rotation.x = Math.PI;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  shine.position.set(-0.07, 1.05, 0.15);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.68), new THREE.MeshBasicMaterial({ color: 0xf4f1e8 }));
  string.position.y = 0.34;
  const tie = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf4f1e8 }));
  tie.position.y = 0.02;
  g.add(ball, knot, shine, string, tie);
  g.userData.balloon = ball;
  g.userData.height = 0.2;
  return shadowy(g, true, false);
}

function fitModel(src: THREE.Object3D, height: number): THREE.Object3D {
  const o = src.clone(true);
  const bb = new THREE.Box3().setFromObject(o);
  const size = bb.getSize(new THREE.Vector3());
  const s = height / (size.y || 1);
  o.scale.multiplyScalar(s);
  const bb2 = new THREE.Box3().setFromObject(o);
  o.position.y -= bb2.min.y;
  const c = bb2.getCenter(new THREE.Vector3());
  o.position.x -= c.x;
  o.position.z -= c.z;
  const wrap = new THREE.Group();
  wrap.add(o);
  return wrap;
}

function sackFallback(): THREE.Object3D {
  const m = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0, 0],
        [0.2, 0.02],
        [0.25, 0.15],
        [0.22, 0.32],
        [0.08, 0.42],
        [0.1, 0.5],
        [0, 0.5],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      20,
    ),
    new THREE.MeshStandardMaterial({ color: 0xc69c62, roughness: 1 }),
  );
  return shadowy(m);
}

export function itemMesh(item: Item, models: ItemModels): THREE.Object3D {
  let o: THREE.Object3D;
  switch (item.kind) {
    case 'sack':
      o = models.sack ? fitModel(models.sack, 0.44) : sackFallback();
      o.userData.height = 0.44;
      break;
    case 'jar':
      o = models.jar ? fitModel(models.jar, 0.46) : sackFallback();
      o.userData.height = 0.46;
      break;
    case 'balloon':
      o = balloonMesh();
      break;
    case 'pair': {
      o = new THREE.Group();
      const b = blockMesh(1);
      b.position.y = 0.16;
      b.userData.float = true;
      const bal = balloonMesh();
      bal.position.y = 0.16 + 0.2;
      bal.scale.setScalar(0.85);
      o.add(b, bal);
      o.userData.height = 0.4;
      o.userData.floatChild = b;
      o.userData.balloonChild = bal;
      break;
    }
    case 'bundle': {
      o = new THREE.Group();
      const parts = item.parts ?? [];
      let x = -((parts.length - 1) * 0.2) / 2;
      for (const p of parts) {
        const b = blockMesh(p);
        b.scale.setScalar(0.85);
        b.position.x = x;
        x += 0.22;
        o.add(b);
      }
      const twine = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.22, parts.length * 0.12), 0.012, 6, 30), new THREE.MeshStandardMaterial({ color: 0xc9a46a }));
      twine.rotation.x = Math.PI / 2;
      twine.scale.set(1, 0.55, 1);
      twine.position.y = 0.12;
      o.add(twine);
      o.userData.height = 0.3;
      break;
    }
    default: {
      const v = Number(item.kind.slice(1));
      o = blockMesh(v);
    }
  }
  o.userData.itemId = item.id;
  o.traverse((c) => (c.userData.itemId = item.id));
  return o;
}

// ------------------------------------------------------------------ props

export function buildChangeBox(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.5, 0.55, BRASS, 0, 0.25, 0));
  g.add(box(0.76, 0.06, 0.6, BRASS_DARK, 0, 0.52, 0));
  g.add(box(0.3, 0.03, 0.06, IRON, 0, 0.56, 0)); // coin slot
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.32), new THREE.MeshBasicMaterial({ map: signTexture(['קופת', 'עודף'], 256, 140, '#f3e6c4', '#3b2a1a') }));
  sign.position.set(0, 0.27, 0.281);
  g.add(sign);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ map: signTexture(['10 → 5+5', '5 → 2+2+1', '2 → 1+1'], 420, 260, '#fff6df', '#3b2a1a', 'ltr'), transparent: true }));
  tag.position.set(0, 0.98, 0);
  tag.userData.billboard = true;
  g.add(tag);
  g.position.set(CHANGE_BOX.x, 0, CHANGE_BOX.z);
  return shadowy(g);
}

export function buildSupplyCrate(): { group: THREE.Group; anchor: THREE.Group } {
  const g = new THREE.Group();
  g.add(box(0.95, 0.38, 0.7, wood(), 0, 0.19, 0));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.22), new THREE.MeshBasicMaterial({ map: signTexture(['ארגז משקולות'], 512, 140) }));
  sign.position.set(0, 0.2, 0.352);
  g.add(sign);
  const anchor = new THREE.Group();
  anchor.position.y = 0.38;
  g.add(anchor);
  g.position.set(SUPPLY.x, 0, SUPPLY.z);
  return { group: shadowy(g), anchor };
}

export function buildShareBoard(): { group: THREE.Group; plates: THREE.Mesh[] } {
  const g = new THREE.Group();
  const plank = box(4.6, 0.06, 1.05, wood(), (SHARE_PLATES[0].x + SHARE_PLATES[3].x) / 2, 0.03, SHARE_PLATES[0].z);
  g.add(plank);
  const plates: THREE.Mesh[] = [];
  for (const p of SHARE_PLATES) {
    const t = signTexture([`÷${p.k}`], 256, 256, '#f6ead0', '#2b2016', 'ltr');
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.86), [CREAM, CREAM, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), CREAM, CREAM, CREAM]);
    m.position.set(p.x, 0.07, p.z);
    m.userData.k = p.k;
    plates.push(m);
    g.add(m);
  }
  const title = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.34), new THREE.MeshBasicMaterial({ map: signTexture(['לוח חלוקה'], 512, 110), transparent: true }));
  title.position.set(plank.position.x, 0.06, SHARE_PLATES[0].z + 0.72);
  title.rotation.x = -Math.PI / 2;
  g.add(title);
  return { group: shadowy(g, false, true), plates };
}

export interface SeesawRig {
  group: THREE.Group;
  plank: THREE.Group;
  bucket: THREE.Group;
  sign: THREE.Mesh;
  setSign(n: number | null, unknown: 'sack' | 'jar'): void;
  angle: number;
}

export function buildSeesaw(): SeesawRig {
  const g = new THREE.Group();
  g.position.set(SEESAW.x, 0, SEESAW.z);
  // A-frame fulcrum
  const frame = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = box(0.14, 0.75, 0.14, darkWood(), s * 0.22, 0.34, 0.22);
    leg.rotation.z = s * 0.35;
    const leg2 = leg.clone();
    leg2.position.z = -0.22;
    frame.add(leg, leg2);
  }
  frame.add(box(0.7, 0.1, 0.62, darkWood(), 0, 0.05, 0));
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 12), IRON);
  pivot.rotation.x = Math.PI / 2;
  pivot.position.y = 0.68;
  frame.add(pivot);
  g.add(frame);

  const plank = new THREE.Group();
  plank.position.y = 0.72;
  plank.add(box(3.4, 0.1, 0.5, wood(), -0.1, 0.05, 0));
  // bucket on the +x (load) end
  const bucket = new THREE.Group();
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.42, 18, 1, true), new THREE.MeshStandardMaterial({ map: woodTexture(5), side: THREE.DoubleSide }));
  tub.position.y = 0.21;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.34, 18), wood());
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.02;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 6, 24), IRON);
  hoop.rotation.x = Math.PI / 2;
  hoop.position.y = 0.32;
  bucket.add(tub, bottom, hoop);
  bucket.position.set(SEESAW.bucket.x - SEESAW.x, 0.1, 0);
  plank.add(bucket);
  // goose end pad
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 18), new THREE.MeshStandardMaterial({ color: 0x2f6b62 }));
  pad.position.set(SEESAW.gooseEnd.x - SEESAW.x, 0.12, 0);
  plank.add(pad);
  g.add(plank);

  // hanging sign on a post
  const post = box(0.1, 2.6, 0.1, darkWood(), 0.2, 1.3, -0.75);
  const arm = box(1.4, 0.08, 0.08, darkWood(), -0.35, 2.55, -0.75);
  g.add(post, arm);
  const signTex = signTexture(['?'], 512, 256);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.66), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(-0.35, 2.12, -0.72);
  g.add(sign);

  shadowy(g);
  const rig: SeesawRig = {
    group: g,
    plank,
    bucket,
    sign,
    angle: 0,
    setSign(n, unknown) {
      const text = n === null ? ['נדנדה נעולה', '🔒'] : [`${n} × ${unknown === 'jar' ? 'צנצנת' : 'שק'}`, 'משקל לשיגור'];
      (sign.material as THREE.MeshBasicMaterial).map = signTexture(text, 680, 300);
      (sign.material as THREE.MeshBasicMaterial).needsUpdate = true;
    },
  };
  return rig;
}

export function buildStampPlates(scalePos: { x: number; z: number }): THREE.Group {
  const g = new THREE.Group();
  for (const p of stampPlates(scalePos)) {
    const label = p.verdict === 'identity' ? ['∞', 'אינסוף פתרונות'] : ['∅', 'אין פתרון'];
    const t = signTexture(label, 256, 256, p.verdict === 'identity' ? '#d8f0e6' : '#f6dcd2', '#2b2016');
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.78), [CREAM, CREAM, new THREE.MeshStandardMaterial({ map: t }), CREAM, CREAM, CREAM]);
    m.position.set(p.x, 0.04, p.z);
    g.add(m);
  }
  return shadowy(g, false, true);
}

export function bubbleSprite(symbol: string, fill: string): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(symbol, fill), transparent: true, depthTest: false }));
  s.scale.set(0.5, 0.55, 1);
  s.renderOrder = 10;
  return s;
}
