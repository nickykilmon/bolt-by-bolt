// Shared PBR materials. Parts get condition-tinted clones via wornMat().
import * as THREE from 'three';
import { TEX } from './textures.js';

const std = (o) => new THREE.MeshStandardMaterial(o);

export const MAT = {};

export function initMaterials() {
  Object.assign(MAT, {
    castIron: std({ color: 0x55585a, roughness: 0.85, metalness: 0.55 }),
    alu: std({ color: 0xb8bcc0, roughness: 0.45, metalness: 0.8 }),
    aluDark: std({ color: 0x8a8e92, roughness: 0.6, metalness: 0.7 }),
    steel: std({ color: 0xa0a4a8, roughness: 0.35, metalness: 0.9 }),
    darkSteel: std({ color: 0x3a3c3e, roughness: 0.5, metalness: 0.8 }),
    chrome: std({ color: 0xe8e8ec, roughness: 0.1, metalness: 1.0, envMapIntensity: 1.4 }),
    rubber: std({ color: 0x1c1c1c, roughness: 0.95, metalness: 0 }),
    tire: std({ color: 0x202020, roughness: 0.92, metalness: 0 }),
    plastic: std({ color: 0x2a2a2a, roughness: 0.7, metalness: 0 }),
    copper: std({ color: 0xb87333, roughness: 0.4, metalness: 0.9 }),
    brass: std({ color: 0xc8a050, roughness: 0.4, metalness: 0.9 }),
    gasket: std({ color: 0x6f6f62, roughness: 0.6, metalness: 0.4 }),
    paper: std({ color: 0xe8e0c8, roughness: 0.9 }),
    redPaint: std({ color: 0xa82a20, roughness: 0.45, metalness: 0.3 }),
    bluePaint: std({ color: 0x23488a, roughness: 0.45, metalness: 0.3 }),
    blackPaint: std({ color: 0x151515, roughness: 0.5, metalness: 0.3 }),
    orangePaint: std({ color: 0xd06a1a, roughness: 0.45, metalness: 0.2 }),
    yellowPaint: std({ color: 0xd8b020, roughness: 0.5, metalness: 0.2 }),
    greenPaint: std({ color: 0x3a6a3a, roughness: 0.5, metalness: 0.2 }),
    carPaint: new THREE.MeshPhysicalMaterial({ color: 0xc4a25a, roughness: 0.45, metalness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
    carPaintDull: new THREE.MeshPhysicalMaterial({ color: 0xa48852, roughness: 0.65, metalness: 0.2, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    primer: std({ color: 0x7a7a72, roughness: 0.9, metalness: 0.0 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x99aabb, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false }),
    lens: std({ color: 0xfff6e0, roughness: 0.1, metalness: 0.2, emissive: 0x000000 }),
    redLens: std({ color: 0x991515, roughness: 0.2, metalness: 0.1, emissive: 0x000000 }),
    interior: std({ color: 0x2c2620, roughness: 0.9 }),
    seat: std({ color: 0x3a2a22, roughness: 0.85 }),
    wood: std({ map: TEX.wood(), roughness: 0.75 }),
    rust: std({ map: TEX.rust(), roughness: 0.95, metalness: 0.3 }),
    cardboard: std({ map: TEX.cardboard(), roughness: 0.9 }),
    filter: std({ color: 0x2850a0, roughness: 0.5, metalness: 0.3 }),
    yellowPlastic: std({ color: 0xe0b020, roughness: 0.6 }),
    redPlastic: std({ color: 0xb02020, roughness: 0.6 }),
    whitePlastic: std({ color: 0xe8e8e0, roughness: 0.6 }),
    belt: std({ color: 0x151515, roughness: 0.8 }),
    ceramic: std({ color: 0xf0eee8, roughness: 0.4 }),
    oil: std({ color: 0x2a1a05, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }),
    coolantGreen: std({ color: 0x40c050, roughness: 0.4 }),
    battery: std({ color: 0x202428, roughness: 0.6 }),
    ghostOk: new THREE.MeshBasicMaterial({ color: 0x60ff80, transparent: true, opacity: 0.28, depthWrite: false }),
    ghostBad: new THREE.MeshBasicMaterial({ color: 0xff6040, transparent: true, opacity: 0.25, depthWrite: false }),
    ghostWire: new THREE.MeshBasicMaterial({ color: 0xffd070, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  });
}

// Condition-dependent tint: worn parts look grimy / rusty.
const wornCache = new Map();
export function wornMat(base, cond) {
  if (!base || cond > 0.75 || base.transparent || !base.isMeshStandardMaterial) return base;
  const bucket = cond < 0.25 ? 2 : 1;
  const key = base.uuid + bucket;
  let m = wornCache.get(key);
  if (!m) {
    m = base.clone();
    const rust = new THREE.Color(0x6a3c22);
    m.color = base.color.clone().lerp(rust, bucket === 2 ? 0.55 : 0.28);
    m.roughness = Math.min(1, base.roughness + 0.25 * bucket);
    m.metalness = base.metalness * (bucket === 2 ? 0.5 : 0.8);
    wornCache.set(key, m);
  }
  return m;
}
