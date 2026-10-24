// Stall-local layout shared by the game controller and the 3D view.
// x to the right, z toward the camera; the vendor stands at the back (−z).

export const FLOOR = { minX: -7.6, maxX: 7.6, minZ: -5.2, maxZ: 5.4 };
export const PAN_OFFSET = 1.55;
export const PAN_RADIUS = 0.72;
export const PAN_REACH = 1.35;
export const GOOSE_RADIUS = 0.32;
export const GOOSE_SPEED = 3.6;
export const START = { x: -0.6, z: 3.9 };

export const COUNTER = { minX: -3.4, maxX: 3.4, minZ: -2.65, maxZ: -2.05 };
export const SHELVES = { minX: -6, maxX: 6, minZ: -5.6, maxZ: -5.0 };
export const CHANGE_BOX = { x: -3.4, z: 0.4, r: 0.45 };
export const SUPPLY = { x: 3.4, z: 0.4, r: 0.5 };
export const SHARE_PLATES = [2, 3, 4, 5].map((k, i) => ({ k, x: -1.65 + i * 1.1, z: 1.85 }));
export const PLATE_HALF = 0.46;
export const SEESAW = { x: 5.4, z: 3.2, gooseEnd: { x: 4.2, z: 3.2 }, bucket: { x: 6.7, z: 3.2 } };
export const WALL_X = 7.9;

export interface Circle {
  x: number;
  z: number;
  r: number;
}
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function panCenter(scalePos: { x: number; z: number }, side: 'L' | 'R'): { x: number; z: number } {
  return { x: scalePos.x + (side === 'L' ? -PAN_OFFSET : PAN_OFFSET), z: scalePos.z };
}

/** Rigged-scale bonus: one ∞ plate and one ∅ plate in front of each scale. */
export function stampPlates(scalePos: { x: number; z: number }) {
  return [
    { verdict: 'identity' as const, x: scalePos.x - 0.6, z: scalePos.z + 2.2 },
    { verdict: 'contradiction' as const, x: scalePos.x + 0.6, z: scalePos.z + 2.2 },
  ];
}

/** Ring slots on a pan, filled in order. */
export function panSlot(i: number, n: number): { x: number; z: number } {
  if (n <= 1) return { x: 0, z: 0 };
  const ring = i < 6 ? 0 : 1;
  const inRing = ring === 0 ? Math.min(n, 6) : n - 6;
  const idx = ring === 0 ? i : i - 6;
  const r = ring === 0 ? (n === 2 ? 0.31 : 0.42) : 0.12;
  const a = (idx / inRing) * Math.PI * 2 + (ring ? 0.5 : -Math.PI / 2);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/** Where supply block i sits on top of the crate (shared by the view and the controller). */
export function supplySlot(i: number): { x: number; z: number } {
  return { x: SUPPLY.x - 0.3 + (i % 3) * 0.3, z: SUPPLY.z - 0.15 + Math.floor(i / 3) * 0.3 };
}
