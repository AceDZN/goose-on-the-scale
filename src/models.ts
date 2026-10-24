// Loads the Tripo GLBs (goose, vendor + animation clips, sack, jar). Falls back to null so the
// game still runs (with procedural stand-ins) if a file is missing.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface LoadedModels {
  goose: THREE.Object3D | null;
  gooseClips: THREE.AnimationClip[];
  vendor: THREE.Object3D | null;
  vendorClips: THREE.AnimationClip[];
  sack: THREE.Object3D | null;
  jar: THREE.Object3D | null;
}

const base = import.meta.env.BASE_URL;

function load(loader: GLTFLoader, file: string): Promise<GLTF | null> {
  return new Promise((resolve) => {
    loader.load(
      `${base}models/${file}`,
      (g) => resolve(g),
      undefined,
      () => resolve(null),
    );
  });
}

function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const s = mat as THREE.MeshStandardMaterial;
        if (s.isMeshStandardMaterial) {
          s.metalness = Math.min(s.metalness, 0.15);
          s.roughness = Math.max(s.roughness, 0.55);
        }
      }
    }
  });
  return root;
}

export async function loadModels(onProgress?: (done: number, total: number) => void): Promise<LoadedModels> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const files = ['goose.glb', 'vendor.glb', 'sack.glb', 'jar.glb'];
  let done = 0;
  const results = await Promise.all(
    files.map((f) =>
      load(loader, f).then((g) => {
        onProgress?.(++done, files.length);
        return g;
      }),
    ),
  );
  const [goose, vendor, sack, jar] = results;
  const vendorClips = vendor?.animations ?? [];
  return {
    goose: goose ? prepare(goose.scene) : null,
    gooseClips: goose?.animations ?? [],
    vendor: vendor ? prepare(vendor.scene) : null,
    vendorClips,
    sack: sack ? prepare(sack.scene) : null,
    jar: jar ? prepare(jar.scene) : null,
  };
}

/** Clip lookup by loose name (Tripo names clips after the preset, e.g. "sing_01"). */
export function findClip(clips: THREE.AnimationClip[], ...names: string[]): THREE.AnimationClip | null {
  for (const n of names) {
    const c = clips.find((c) => c.name.toLowerCase().includes(n));
    if (c) return c;
  }
  return null;
}
