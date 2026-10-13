// Heightfield terrain with roads carved in, surface lookup, trees, lake.
import * as THREE from 'three';
import { fbm, mulberry32, clamp, smooth, lerp } from '../core/util.js';
import { TEX, repeated } from '../core/textures.js';

export const SIZE = 1600, CELL = 4, N = SIZE / CELL;
const HALF = SIZE / 2;
export const LAKE = { x: 150, z: -175, r: 70, level: -1.6, SHORE: 88 }; // SHORE: radius of the waterline
export const YARD = { x: 0, z: 8, r: 34 };
// flattened building zones (h filled in at build time)
export const ZONES = [
  { id: 'home', x: 0, z: 8, r: 34, fixed: 0 },
  { id: 'town', x: 565, z: 135, r: 105 },
  { id: 'scrapyard', x: -470, z: 225, r: 55 },
  { id: 'pertti', x: -205, z: 112, r: 32 },
  { id: 'makela', x: 330, z: 128, r: 26 },
];
const HILLS = [
  { x: -560, z: -200, h: 52, r: 320 },   // Hirvimäki
  { x: -230, z: -170, h: 20, r: 170 },   // Harju ridge
  { x: 520, z: -260, h: 30, r: 230 },    // Kallio
  { x: 120, z: 420, h: 30, r: 220 },     // northern heights
  { x: -320, z: 470, h: 40, r: 180 },
];

// pts are [x, z]. rough = bump amplitude (m), jumps = positions along the road (0..1)
export const ROADS = [
  { name: 'Route 54', type: 'asphalt', w: 7, smooth: 16, rough: 0.008, pts: [[-780, 235], [-690, 215], [-610, 190], [-540, 172], [-470, 150], [-400, 112], [-330, 82], [-260, 70], [-200, 60], [-120, 52], [0, 46], [90, 60], [170, 42], [240, 58], [320, 82], [400, 104], [460, 92], [520, 80], [600, 82], [660, 64], [720, 20], [780, -45]] },
  { name: 'Driveway', type: 'gravel', w: 4, smooth: 4, rough: 0.01, pts: [[-1.2, 6], [-0.8, 16], [0, 30], [0, 46]] },
  { name: 'Kirkkotie', label: 'Church Road', type: 'asphalt', w: 6, smooth: 6, rough: 0.008, town: true, pts: [[560, 81], [562, 120], [566, 160], [575, 205], [592, 262]] },
  { name: 'Romutie', label: 'Scrapyard road', type: 'gravel', w: 4.5, smooth: 4, rough: 0.03, pts: [[-474, 146], [-472, 175], [-470, 200]] },
  { name: 'Pertin tie', label: 'Pertti\'s road', type: 'gravel', w: 3.5, smooth: 4, rough: 0.03, pts: [[-205, 58], [-205, 80], [-205, 98]] },
  { name: 'Makelantie', label: 'Mäkelä\'s road', type: 'gravel', w: 3.5, smooth: 4, rough: 0.03, pts: [[332, 86], [331, 102], [330, 116]] },
  { name: 'Metsätie', label: 'Forest Road (rally stage)', type: 'gravel', w: 5.5, smooth: 10, rough: 0.035, stage: true, pts: [[170, 42], [205, -20], [262, -62], [300, -90], [335, -150], [310, -230], [250, -280], [190, -300], [110, -290], [40, -270], [-10, -230], [-30, -170], [-75, -125], [-120, -70], [-160, -20], [-200, 60]] },
  { name: 'Harju', label: 'Harju Ridge (rally stage)', type: 'dirt', w: 4.6, smooth: 11, rough: 0.07, stage: true, jumps: [0.22, 0.47, 0.68, 0.86], pts: [[-330, 82], [-345, 30], [-310, -10], [-350, -60], [-300, -100], [-245, -85], [-200, -125], [-225, -185], [-170, -225], [-120, -200], [-90, -240], [-40, -230], [-10, -230]] },
  { name: 'Hirvimäki', label: 'Moose Hill (rally stage)', type: 'gravel', w: 5, smooth: 12, rough: 0.05, stage: true, jumps: [0.35, 0.78], pts: [[-610, 190], [-640, 130], [-590, 75], [-670, 20], [-590, -35], [-675, -95], [-585, -150], [-670, -210], [-570, -265], [-500, -330], [-420, -360], [-360, -300], [-440, -250], [-370, -195], [-450, -140], [-385, -80], [-450, -20], [-400, 40], [-400, 112]] },
  { name: 'Kalliojärvi', label: 'Rock Lake (rally stage)', type: 'gravel', w: 5, smooth: 10, rough: 0.09, stage: true, jumps: [0.15, 0.33, 0.52, 0.7, 0.88], pts: [[300, -90], [380, -60], [455, -105], [515, -55], [600, -110], [565, -195], [640, -255], [575, -330], [480, -310], [440, -385], [340, -415], [275, -370], [310, -230]] },
  { name: 'Super Special', label: 'Super Special (rally stage)', type: 'asphalt', w: 6, smooth: 4, rough: 0.012, stage: true, pts: [[592, 262], [655, 300], [705, 362], [650, 425], [565, 405], [505, 345], [525, 288], [575, 262]] },
];

const rng = mulberry32(1234);
let H = null; // Float32Array (N+1)^2
let ROUGH = null; // Float32Array at 2 m resolution: bump amplitude
const RN = SIZE / 2;
const idx = (i, j) => j * (N + 1) + i;

// ---- road sampling ----
function sampleRoad(road) {
  const curve = new THREE.CatmullRomCurve3(road.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / 2));
  const pts = curve.getSpacedPoints(n);
  road.samples = pts.map((p) => ({ x: p.x, z: p.z, h: 0 }));
  road.length = len;
}
function rawNatural(x, z) {
  const dh = Math.hypot(x - YARD.x, z - YARD.z);
  const calm = 0.25 + 0.75 * smooth(clamp((dh - 60) / 260, 0, 1)); // gentle around home
  let h = (fbm(x / 380, z / 380, 4) * 34 + fbm(x / 120 + 7, z / 120 - 3, 3) * 7 + Math.abs(fbm(x / 70 - 3, z / 70 + 9, 2)) * 4) * calm;
  for (const hl of HILLS) { const d2 = ((x - hl.x) ** 2 + (z - hl.z) ** 2) / (hl.r * hl.r); h += hl.h * Math.exp(-d2 * 2.2); }
  // lake: a bowl below the water inside the shoreline, and a beach that is always above the water
  // outside it, so there are no dry dips lower than the lake next to it
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z), RS = LAKE.SHORE;
  if (dl < RS) {
    const t = dl / RS;
    const bowl = LAKE.level - 3.2 + Math.pow(t, 2) * 2.9;          // reaches level - 0.3 at the shore
    h = Math.min(h, bowl);
  } else {
    // floor that rises gently from the waterline, then slowly lets go far from the lake (continuous, no steps)
    const floor = LAKE.level + 0.3 + Math.min(dl - RS, 40) * 0.04 - Math.max(0, dl - RS - 200) * 0.05;
    h = Math.max(h, floor);
  }
  return h;
}
function zoneBlend(x, z, h) {
  for (const zn of ZONES) {
    const d = Math.hypot(x - zn.x, z - zn.z);
    if (d < zn.r) return zn.h;
    if (d < zn.r + 35) h = lerp(zn.h, h, smooth((d - zn.r) / 35));
  }
  return h;
}
function natural(x, z) { return zoneBlend(x, z, rawNatural(x, z)); }
export function zoneAt(x, z) { for (const zn of ZONES) if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return zn; return null; }

// road segment spatial grid
const RG = 24;
const roadGrid = new Map();
function addSeg(road, i) {
  const a = road.samples[i], b = road.samples[i + 1];
  const pad = road.w;
  const x0 = Math.floor((Math.min(a.x, b.x) - pad) / RG), x1 = Math.floor((Math.max(a.x, b.x) + pad) / RG);
  const z0 = Math.floor((Math.min(a.z, b.z) - pad) / RG), z1 = Math.floor((Math.max(a.z, b.z) + pad) / RG);
  for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
    const k = gx + ',' + gz; let l = roadGrid.get(k); if (!l) roadGrid.set(k, (l = [])); l.push([road, i]);
  }
}
// nearest road point within reach
export function nearestRoad(x, z, reach = 30) {
  let best = null, bd = reach;
  const r = Math.ceil(reach / RG);
  const gx = Math.floor(x / RG), gz = Math.floor(z / RG);
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const l = roadGrid.get((gx + dx) + ',' + (gz + dz)); if (!l) continue;
    for (const [road, i] of l) {
      const a = road.samples[i], b = road.samples[i + 1];
      const ux = b.x - a.x, uz = b.z - a.z, L2 = ux * ux + uz * uz;
      const t = clamp(((x - a.x) * ux + (z - a.z) * uz) / L2, 0, 1);
      const px = a.x + ux * t, pz = a.z + uz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; best = { road, d, h: lerp(a.h, b.h, t), i, t, dirx: ux / Math.sqrt(L2), dirz: uz / Math.sqrt(L2) }; }
    }
  }
  return best;
}

export function buildTerrainData() {
  for (const zn of ZONES) zn.h = zn.fixed ?? Math.round(rawNatural(zn.x, zn.z) * 2) / 2;
  for (const r of ROADS) sampleRoad(r);
  // road heights: natural, smoothed
  for (const r of ROADS) {
    const s = r.samples;
    let hs = s.map((p) => natural(p.x, p.z));
    for (let pass = 0; pass < 3; pass++) {
      const w = r.smooth;
      hs = hs.map((_, i) => { let sum = 0, n = 0; for (let k = -w; k <= w; k++) { const j = clamp(i + k, 0, hs.length - 1); sum += hs[j]; n++; } return sum / n; });
    }
    // limit the gradient (cuttings / embankments), 2 m between samples
    const maxStep = 0.14 * 2;
    for (let it = 0; it < 4; it++) {
      const f = hs.slice(), b = hs.slice();
      for (let i = 1; i < hs.length; i++) f[i] = clamp(f[i], f[i - 1] - maxStep, f[i - 1] + maxStep);
      for (let i = hs.length - 2; i >= 0; i--) b[i] = clamp(b[i], b[i + 1] - maxStep, b[i + 1] + maxStep);
      hs = hs.map((_, i) => (f[i] + b[i]) / 2);
    }
    // jump kickers: a ramp up over ~24 m, then a sharp drop over ~8 m
    r.jumpIdx = [];
    for (const f of r.jumps || []) {
      // slide the kicker to the straightest stretch nearby so it can be taken flat out
      const head = (i) => Math.atan2(s[Math.min(i + 1, s.length - 1)].x - s[i].x, s[Math.min(i + 1, s.length - 1)].z - s[i].z);
      let k = Math.floor(f * (s.length - 1)), bestBend = Infinity;
      for (let c = k - 50; c <= k + 50; c++) {
        if (c < 30 || c > s.length - 20) continue;
        let bend = 0;
        for (let q = c - 24; q < c + 10; q += 2) bend += Math.abs(Math.atan2(Math.sin(head(q + 2) - head(q)), Math.cos(head(q + 2) - head(q))));
        if (bend < bestBend) { bestBend = bend; k = c; }
      }
      r.jumpIdx.push(k);
      for (let j = -10; j <= 12; j++) {
        const i = k + j; if (i < 0 || i >= s.length) continue;
        const prof = j <= 0 ? 1.5 * smooth((j + 10) / 10) : j <= 3 ? lerp(1.5, -0.6, j / 3) : -0.6 * (1 - smooth((j - 3) / 9));
        hs[i] += prof;
      }
    }
    s.forEach((p, i) => { p.h = hs[i]; });
    for (let i = 0; i < s.length - 1; i++) addSeg(r, i);
  }
  // junction smoothing: secondary roads take the height of the main road at their ends
  for (const r of ROADS.slice(1)) for (const end of [0, r.samples.length - 1]) {
    const p = r.samples[end];
    const other = nearestRoadExcept(p.x, p.z, r);
    if (other && other.d < 10) {
      const dh = other.h - p.h;
      const n = Math.min(r.samples.length, 25);
      for (let k = 0; k < n; k++) { const j = end === 0 ? k : r.samples.length - 1 - k; r.samples[j].h += dh * (1 - k / n); }
    }
  }
  H = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = -HALF + i * CELL, z = -HALF + j * CELL;
    let h = natural(x, z);
    const nr = nearestRoad(x, z, 26);
    if (nr) {
      const hw = nr.road.w / 2 + 1.5;
      if (nr.d < hw) h = nr.h - 0.05;
      else h = lerp(nr.h - 0.05, h, smooth(clamp((nr.d - hw) / 16, 0, 1)));
    }
    const zn = zoneAt(x, z);
    if (zn && (!nr || nr.d > nr.road.w / 2 + 1.5)) h = zn.h;
    H[idx(i, j)] = h;
  }
  // roughness map (2 m cells)
  ROUGH = new Float32Array(RN * RN);
  for (const r of ROADS) {
    const rad = r.w / 2 + 0.6;
    for (const p of r.samples) {
      const i0 = Math.floor((p.x - rad + HALF) / 2), i1 = Math.floor((p.x + rad + HALF) / 2);
      const j0 = Math.floor((p.z - rad + HALF) / 2), j1 = Math.floor((p.z + rad + HALF) / 2);
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        if (ii < 0 || jj < 0 || ii >= RN || jj >= RN) continue;
        const k = jj * RN + ii; if (r.rough > ROUGH[k]) ROUGH[k] = r.rough;
      }
    }
  }
}
// small bumps / ruts / washboard on the road surface (felt by the wheels, drawn on the road mesh)
export function bumpAt(x, z) {
  if (!ROUGH) return 0;
  const i = Math.floor((x + HALF) / 2), j = Math.floor((z + HALF) / 2);
  if (i < 0 || j < 0 || i >= RN || j >= RN) return 0;
  const a = ROUGH[j * RN + i];
  if (!a) return 0;
  return a * (Math.sin(x * 1.9 + z * 0.7) * 0.6 + Math.sin(z * 2.3 - x * 1.1) * 0.5 + Math.sin((x + z) * 4.7) * 0.25 + Math.sin(x * 0.45 - z * 0.38) * 0.6) / 1.9;
}
export function groundY(x, z) { return heightAt(x, z) + bumpAt(x, z); }
function nearestRoadExcept(x, z, except) {
  let best = null;
  for (const r of ROADS) {
    if (r === except) continue;
    for (const p of r.samples) { const d = Math.hypot(p.x - x, p.z - z); if (!best || d < best.d) best = { d, h: p.h }; }
  }
  return best;
}

export function heightAt(x, z) {
  const fx0 = (x + HALF) / CELL, fz0 = (z + HALF) / CELL;
  let i = Math.floor(fx0), j = Math.floor(fz0);
  if (i < 0 || j < 0 || i >= N || j >= N) return -5;
  const fx = fx0 - i, fz = fz0 - j;
  const h00 = H[idx(i, j)], h10 = H[idx(i + 1, j)], h01 = H[idx(i, j + 1)], h11 = H[idx(i + 1, j + 1)];
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}
export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 0.6;
  const hl = heightAt(x - e, z), hr = heightAt(x + e, z), hd = heightAt(x, z - e), hu = heightAt(x, z + e);
  return out.set(hl - hr, 2 * e, hd - hu).normalize();
}

const SURF = {
  asphalt: { name: 'asphalt', grip: 1.0, roll: 0.0, dust: 0, noise: 0.2 },
  gravel: { name: 'gravel', grip: 0.74, roll: 0.008, dust: 1, noise: 1 },
  dirt: { name: 'dirt', grip: 0.7, roll: 0.01, dust: 0.8, noise: 0.7 },
  grass: { name: 'grass', grip: 0.58, roll: 0.02, dust: 0.2, noise: 0.4 },
  concrete: { name: 'concrete', grip: 0.95, roll: 0.0, dust: 0, noise: 0.1 },
  water: { name: 'water', grip: 0.3, roll: 0.2, dust: 0, noise: 0 },
};
export const WEATHER = { wet: 0 };
export function surfaceAt(x, z) {
  let s;
  if (x > -6.2 && x < 6.2 && z > -5.2 && z < 5.2) s = SURF.concrete;
  else {
    const nr = nearestRoad(x, z, 8);
    if (nr && nr.d < nr.road.w / 2 + 0.4) s = SURF[nr.road.type];
    else if (heightAt(x, z) < LAKE.level - 0.3) s = SURF.water;
    else { const zn = zoneAt(x, z); s = zn && (zn.id === 'town' || zn.id === 'scrapyard') ? SURF.gravel : SURF.grass; }
  }
  if (WEATHER.wet > 0) return { ...s, grip: s.grip * (1 - WEATHER.wet * (s.name === 'asphalt' ? 0.25 : 0.15)) };
  return s;
}

// ---------------- meshes ----------------
export function buildTerrainMesh(scene, quality) {
  const step = 1; // render mesh must match the physics heightfield
  const n = N / step;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((n + 1) * (n + 1) * 3), col = new Float32Array((n + 1) * (n + 1) * 3), uv = new Float32Array((n + 1) * (n + 1) * 2);
  const c = new THREE.Color();
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const k = j * (n + 1) + i;
    const gi = i * step, gj = j * step;
    const x = -HALF + gi * CELL, z = -HALF + gj * CELL, h = H[idx(gi, gj)];
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
    const field = fbm(x / 140 + 50, z / 140, 2);
    const nrm = normalAt(x, z);
    c.setRGB(0.27, 0.42, 0.17);
    const dYard = Math.min(...ZONES.map((zn) => Math.hypot(x - zn.x, z - zn.z) - zn.r + 34));
    if (field > 0.22 && dYard > 140) c.setRGB(0.62, 0.58, 0.3); // hay fields
    if (dYard < YARD.r + 6) c.lerp(new THREE.Color(0.42, 0.42, 0.28), 0.35); // trodden yard
    c.offsetHSL(0, 0, fbm(x / 20, z / 20, 2) * 0.06);
    if (nrm.y < 0.86) c.lerp(new THREE.Color(0.42, 0.4, 0.36), clamp((0.86 - nrm.y) * 6, 0, 1));
    if (h < LAKE.level + 0.6 && Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.6) c.setRGB(0.45, 0.4, 0.3);
    const nr = nearestRoad(x, z, 10);
    if (nr && nr.d < nr.road.w / 2 + 3) c.lerp(new THREE.Color(0.4, 0.34, 0.26), 0.6);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  const index = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, d = a + (n + 1), e = d + 1;
    index.push(a, d, b, b, d, e);
  }
  geo.setIndex(index);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.grass(), roughness: 0.95, metalness: 0, envMapIntensity: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.surface = true;
  mesh.userData.terrain = true;
  scene.add(mesh);

  // roads
  const roadMats = {
    asphalt: new THREE.MeshStandardMaterial({ map: repeated(TEX.asphalt(), 1, 1), bumpMap: repeated(TEX.asphalt(), 1, 1), bumpScale: 0.5, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }),
    gravel: new THREE.MeshStandardMaterial({ map: repeated(TEX.gravel(), 1, 1), bumpMap: repeated(TEX.gravel(), 1, 1), bumpScale: 1.2, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }),
    dirt: new THREE.MeshStandardMaterial({ map: repeated(TEX.gravel(), 1, 1), bumpMap: repeated(TEX.gravel(), 1, 1), bumpScale: 1.2, color: 0x9a7a58, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }),
  };
  for (const r of ROADS) {
    const s = r.samples, P = [], U = [], I = [];
    let dist = 0;
    for (let i = 0; i < s.length; i++) {
      const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      if (i > 0) dist += Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z);
      for (const side of [-1, 1]) {
        const x = s[i].x + nx * side * r.w / 2, z = s[i].z + nz * side * r.w / 2;
        P.push(x, heightAt(x, z) + bumpAt(x, z) + 0.06, z);
        U.push(side < 0 ? 0 : 1, dist / r.w);
      }
      if (i > 0) { const k = i * 2; I.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, roadMats[r.type]);
    m.receiveShadow = true; m.userData.surface = true;
    scene.add(m);
  }
  // lake
  const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.SHORE + 5, 64), new THREE.MeshStandardMaterial({ color: 0x2a4a5a, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.88 }));
  water.rotation.x = -Math.PI / 2; water.position.set(LAKE.x, LAKE.level, LAKE.z);
  scene.add(water);
  return mesh;
}

// ---------------- trees ----------------
export const TREES = { grid: new Map(), cell: 10 };
export function buildTrees(scene, quality) {
  const count = quality === 'low' ? 2500 : quality === 'medium' ? 5000 : 8000;
  const spruce = [], birch = [];
  const r = mulberry32(99);
  let tries = 0;
  while (spruce.length + birch.length < count && tries < count * 6) {
    tries++;
    const x = (r() - 0.5) * (SIZE - 40), z = (r() - 0.5) * (SIZE - 40);
    const dens = fbm(x / 160 - 20, z / 160 + 4, 3);
    if (dens < -0.05 + r() * 0.15) continue;
    if (ZONES.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 14)) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.25) continue;
    const nr = nearestRoad(x, z, 12);
    if (nr && nr.d < nr.road.w / 2 + 3.5) continue;
    if (fbm(x / 140 + 50, z / 140, 2) > 0.2 && Math.hypot(x - YARD.x, z - YARD.z) > 140) continue; // keep fields open
    const y = heightAt(x, z);
    const s = 0.75 + r() * 0.6;
    (r() < 0.72 ? spruce : birch).push({ x, y, z, s, rot: r() * 6.28 });
  }
  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  const mk = (list, trunkGeo, trunkMat, crownGeo, crownMat) => {
    const t = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const c = new THREE.InstancedMesh(crownGeo, crownMat, list.length);
    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
      t.setMatrixAt(i, dummy.matrix); c.setMatrixAt(i, dummy.matrix);
      const v = 0.8 + r() * 0.35; c.setColorAt(i, tint.setRGB(v * (0.92 + r() * 0.16), v, v * (0.9 + r() * 0.15)));
      const k = Math.floor(p.x / TREES.cell) + ',' + Math.floor(p.z / TREES.cell);
      let l = TREES.grid.get(k); if (!l) TREES.grid.set(k, (l = [])); l.push({ x: p.x, z: p.z, r: 0.22 * p.s });
    });
    t.castShadow = c.castShadow = quality !== 'low';
    t.receiveShadow = c.receiveShadow = true;
    scene.add(t, c);
  };
  // spruce: five drooping tiers with jagged edges; birch: a cluster of leafy blobs on a white trunk
  const jag = (geo, amt, seed) => {
    const p = geo.attributes.position; // displacement hashed from the position, so shared corners stay welded
    const hsh = (x, y, z, o) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1 + o) * 43758.5453; return v - Math.floor(v) - 0.5; };
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + hsh(x, y, z, 0) * amt; p.setX(i, x * k); p.setZ(i, z * k); p.setY(i, y + hsh(x, y, z, 1.7) * amt * 0.6); }
    geo.computeVertexNormals(); return geo;
  };
  const tiers = [];
  for (let t = 0; t < 4; t++) {
    const rad = 2.3 - t * 0.45, h = 3.7 - t * 0.3, y = 3.1 + t * 2.25;
    tiers.push(jag(new THREE.ConeGeometry(rad, h, 9, 1, true).translate(0, y + h / 2, 0), 0.25, 10 + t));
  }
  const merged = mergeGeos(tiers);
  const needleM = new THREE.MeshStandardMaterial({ color: 0x2c4a30, roughness: 0.95, side: THREE.DoubleSide, flatShading: true });
  mk(spruce, new THREE.CylinderGeometry(0.12, 0.3, 4.5, 7).translate(0, 2.25, 0), new THREE.MeshStandardMaterial({ map: TEX.bark(), bumpMap: TEX.bark(), bumpScale: 2, roughness: 1 }),
    merged, needleM);
  const blobs = [[0, 7.6, 0, 2.2], [1.1, 6.6, 0.4, 1.5], [-1.0, 6.9, -0.5, 1.6], [0.2, 8.9, -0.2, 1.5]]
    .map(([x, y, z, r0], i) => jag(new THREE.IcosahedronGeometry(r0, 1).scale(1, 1.15, 1).translate(x, y, z), 0.3, 50 + i));
  mk(birch, new THREE.CylinderGeometry(0.09, 0.17, 7.4, 7).translate(0, 3.7, 0), new THREE.MeshStandardMaterial({ map: TEX.birch(), roughness: 0.8 }),
    mergeGeos(blobs), new THREE.MeshStandardMaterial({ color: 0x6f9440, roughness: 0.9, flatShading: true }));
  // ground cover: grass tufts (crossed alpha cards), denser around places you spend time
  const tuftN = quality === 'low' ? 0 : quality === 'medium' ? 6000 : 12000;
  if (tuftN) {
    const card = new THREE.PlaneGeometry(0.7, 0.5).translate(0, 0.25, 0);
    const tuftGeo = mergeGeos([card, card.clone().rotateY(Math.PI / 2)]);
    const uvs = []; for (let k = 0; k < 2; k++) uvs.push(0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1); // PlaneGeometry index order 0,2,1 2,3,1
    tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const tuftM = new THREE.MeshStandardMaterial({ map: TEX.tuft(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftM, tuftN);
    const col = new THREE.Color();
    let n = 0, guard = 0;
    while (n < tuftN && guard++ < tuftN * 8) {
      let x, z;
      if (r() < 0.65) { const zn = ZONES[Math.floor(r() * ZONES.length)], a = r() * 6.28, d = zn.r * 0.6 + r() * 160; x = zn.x + Math.cos(a) * d; z = zn.z + Math.sin(a) * d; }
      else { x = (r() - 0.5) * (SIZE - 40); z = (r() - 0.5) * (SIZE - 40); }
      if (Math.abs(x) > HALF - 10 || Math.abs(z) > HALF - 10) continue;
      if (Math.hypot(x - YARD.x, z - YARD.z) < 22 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.3) continue;
      const nr = nearestRoad(x, z, 8); if (nr && nr.d < nr.road.w / 2 + 1) continue;
      if (ZONES.some((zn) => zn.id === 'town' && Math.hypot(x - zn.x, z - zn.z) < zn.r - 20)) continue;
      dummy.position.set(x, heightAt(x, z) - 0.03, z); dummy.rotation.set(0, r() * 6.28, 0); dummy.scale.setScalar(0.45 + r() * 0.7); dummy.updateMatrix();
      tufts.setMatrixAt(n, dummy.matrix);
      tufts.setColorAt(n, col.setHSL(0.17 + r() * 0.07, 0.25 + r() * 0.2, 0.42 + r() * 0.18));
      n++;
    }
    tufts.count = n;
    tufts.raycast = () => {};
    scene.add(tufts);
  }
  // rocks
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1, flatShading: true }), 300);
  for (let i = 0; i < 300; i++) {
    let x, z; do { x = (r() - 0.5) * (SIZE - 60); z = (r() - 0.5) * (SIZE - 60); } while (nearestRoad(x, z, 10) || Math.hypot(x - YARD.x, z - YARD.z) < 50);
    dummy.position.set(x, heightAt(x, z) - 0.3, z); dummy.rotation.set(r(), r() * 6, r()); dummy.scale.set(0.5 + r() * 1.5, 0.4 + r(), 0.5 + r() * 1.5); dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = true; rocks.receiveShadow = true;
  scene.add(rocks);
}

function mergeGeos(geos) {
  const g = new THREE.BufferGeometry();
  const pos = [], norm = []; const idxs = []; let off = 0;
  for (const s of geos) {
    const gi = s.index ? s.toNonIndexed() : s;
    pos.push(...gi.attributes.position.array); norm.push(...gi.attributes.normal.array);
    for (let i = 0; i < gi.attributes.position.count; i++) idxs.push(off + i);
    off += gi.attributes.position.count;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  return g;
}

export function treesNear(x, z, out = []) {
  out.length = 0;
  const gx = Math.floor(x / TREES.cell), gz = Math.floor(z / TREES.cell);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const l = TREES.grid.get((gx + dx) + ',' + (gz + dz)); if (l) out.push(...l); }
  return out;
}
