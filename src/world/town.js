// Ruskala village, the gas station, Romu-Raimo's scrapyard and the neighbours' farms.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { labelTex } from '../core/textures.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { addCollider } from './colliders.js';
import { ZONES, heightAt } from './terrain.js';
import { mats, interact } from './buildings.js';
import { mulberry32 } from '../core/util.js';

const zh = (id) => ZONES.find((z) => z.id === id).h;
const _v = new THREE.Vector3();

// Solid box inside a (possibly 90°-rotated) group, with a world-space collider.
function solid(g, w, h, d, mat, x, y, z, opts = {}) {
  const m = box(g, w, h, d, mat, x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (opts.collide !== false) {
    g.updateWorldMatrix(true, false);
    const b = new THREE.Box3();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) b.expandByPoint(g.localToWorld(_v.set(x + sx * w / 2, y + sy * h / 2, z + sz * d / 2)));
    addCollider(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, opts);
  }
  if (opts.surface) m.userData.surface = true;
  return m;
}
function sign(g, text, w, h, x, y, z, bg = '#1a3a7a', fg = '#fff', ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: labelTex(text, 512, Math.round(512 * h / w), bg, fg, `bold ${Math.round(300 * h / w)}px Arial`), roughness: 0.6 }));
  m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m;
}

// A shop-type building. Local frame: front (door) faces +z. rot = multiples of 90°.
function building(parent, { x, z, rot = 0, w = 10, d = 8, h = 3.4, wallMat, roofMat, title, signBg, door = 2.2, garageDoor = 0, y }) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  const t = 0.2, W = wallMat || mats.planks;
  solid(g, w, 0.1, d, mats.woodFloor, 0, -0.04, 0, { collide: false, surface: true });
  solid(g, w, h, t, W, 0, h / 2, -d / 2);                       // back
  solid(g, t, h, d, W, -w / 2, h / 2, 0); solid(g, t, h, d, W, w / 2, h / 2, 0); // sides
  // front with door (and optional garage door)
  const open = garageDoor || door;
  const side = (w - open) / 2;
  solid(g, side, h, t, W, -w / 2 + side / 2, h / 2, d / 2);
  solid(g, side, h, t, W, w / 2 - side / 2, h / 2, d / 2);
  const lintelH = garageDoor ? 2.8 : 2.2;
  solid(g, open, h - lintelH, t, W, 0, (h + lintelH) / 2, d / 2);
  // windows (decor) on the front
  if (!garageDoor) for (const sx of [-1, 1]) { const win = box(g, Math.min(2, side - 0.6), 1.1, 0.03, MAT.glass, sx * (open / 2 + side / 2), 1.5, d / 2 + 0.11); win.userData.glass = true; }
  // roof
  const R = roofMat || mats.roof;
  solid(g, w + 0.6, 0.15, d + 0.6, R, 0, h + 0.07, 0, { collide: false });
  for (const s of [1, -1]) { const r = box(g, w + 0.8, 0.08, d / 2 + 0.6, R, 0, h + 0.75, s * d / 4); r.rotation.x = s * 0.33; r.castShadow = true; }
  box(g, w, 1.1, 0.12, W, 0, h + 0.55, d / 2 - 0.05); box(g, w, 1.1, 0.12, W, 0, h + 0.55, -d / 2 + 0.05);
  if (title) sign(g, title, Math.min(w - 1, 6), 0.8, 0, h - 0.5, d / 2 + 0.13, signBg);
  const lamp = new THREE.PointLight(0xffe8c0, 6, 12, 1.6); lamp.position.set(0, h - 0.4, 0); g.add(lamp);
  return g;
}
function counter(g, x, z, w = 2.6) { return solid(g, w, 1.0, 0.6, MAT.wood, x, 0.5, z, { surface: true }); }
function shelfRow(g, x, z, n = 3) {
  for (let i = 0; i < n; i++) {
    solid(g, 0.4, 1.8, 1.6, MAT.darkSteel, x, 0.9, z + i * 1.9);
    for (const y of [0.5, 1.0, 1.5]) for (let k = 0; k < 4; k++) box(g, 0.3, 0.25, 0.3, [MAT.redPaint, MAT.bluePaint, MAT.yellowPaint, MAT.cardboard][(i + k) % 4], x, y + 0.13, z + i * 1.9 - 0.6 + k * 0.4);
  }
}
function house(parent, x, z, rot, color, y) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  solid(g, 8, 3, 6, m, 0, 1.5, 0);
  for (const s of [1, -1]) { const r = box(g, 8.6, 0.1, 3.7, mats.roof, 0, 3.6, s * 1.6); r.rotation.x = s * 0.45; r.castShadow = true; }
  box(g, 8, 1.2, 0.1, m, 0, 3.4, 2.9); box(g, 8, 1.2, 0.1, m, 0, 3.4, -2.9);
  box(g, 1, 2, 0.05, MAT.wood, 1.5, 1, 3.03);
  for (const sx of [-2, 3.2]) { const w = box(g, 1, 1, 0.05, MAT.glass, sx, 1.6, 3.03); w.userData.glass = true; box(g, 1.15, 1.15, 0.03, MAT.whitePlastic, sx, 1.6, 3.01); }
  box(g, 0.6, 1.2, 0.6, mats.planks, -2.5, 4, 0);
  return g;
}
function mailbox(game, parent, id, name, x, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = ry; parent.add(g);
  box(g, 0.08, 1.1, 0.08, MAT.wood, 0, 0.55, 0); box(g, 0.32, 0.26, 0.45, MAT.yellowPaint, 0, 1.2, 0);
  sign(g, name, 0.4, 0.1, 0, 1.0, 0.05, '#fff', '#222');
  const mb = { id, name, pos: new THREE.Vector3(x, 0, z), obj: g };
  game.mailboxes.push(mb);
  interact(g, { prompt: () => game.jobs.mailboxPrompt(mb), use: (b) => game.jobs.mailboxUse(mb, b) });
  return mb;
}

export function buildTown(game) {
  const scene = game.scene;
  const root = new THREE.Group(); root.name = 'town'; scene.add(root);
  game.townRoot = root;
  game.mailboxes = [];
  game.npcSpots = {};
  const T = zh('town');

  // ---------------- gas station ----------------
  const gas = new THREE.Group(); gas.position.set(482, T, 104); root.add(gas);
  const canopyM = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5 });
  box(gas, 14, 0.4, 9, canopyM, 0, 4.6, -1);
  box(gas, 14.05, 0.42, 0.2, MAT.redPaint, 0, 4.6, 3.5);
  for (const sx of [-5.5, 5.5]) solid(gas, 0.35, 4.5, 0.35, MAT.chrome, sx, 2.25, -1);
  sign(gas, 'KAASU-KALLE  ·  BENSA 7,90 mk/L', 8, 0.6, 0, 4.2, 3.62, '#b01010');
  const pumps = [];
  for (const sx of [-3, 3]) {
    const p = new THREE.Group(); p.position.set(sx, 0, -1); gas.add(p);
    solid(p, 0.8, 1.8, 0.5, MAT.redPaint, 0, 0.9, 0);
    box(p, 0.6, 0.35, 0.02, mats.screen, 0, 1.45, 0.26);
    const noz = box(p, 0.08, 0.25, 0.1, MAT.blackPaint, 0.38, 1.0, 0.1);
    box(p, 1.4, 0.15, 0.8, MAT.darkSteel, 0, 0.07, 0);
    const pump = { obj: p, pos: () => p.getWorldPosition(new THREE.Vector3()) };
    interact(p, { prompt: () => game.gasPumpPrompt(pump), use: (b) => game.gasPumpUse(pump, b) });
    pumps.push(pump);
  }
  game.pumps = pumps;
  // air compressor
  const air = new THREE.Group(); air.position.set(7.5, 0, -1); gas.add(air);
  solid(air, 0.5, 1.2, 0.4, MAT.bluePaint, 0, 0.6, 0); sign(air, 'ILMA / AIR', 0.5, 0.2, 0, 1.0, 0.21, '#1a3a7a');
  interact(air, { prompt: () => '<span class="k">E</span>Tyre air & setup (tuning screen)', use: () => game.ui.openTuning() });
  // kiosk
  const kiosk = building(root, { x: 482, z: 116, w: 9, d: 6, title: 'KIOSKI', signBg: '#b01010', y: T, rot: Math.PI });
  counter(kiosk, 0, -1.2, 3);
  shelfRow(kiosk, -3.6, -1.8, 2);
  game.npcSpots.kiosk = kiosk.localToWorld(new THREE.Vector3(0, 0, -2.1));
  game.kioskCounter = kiosk.localToWorld(new THREE.Vector3(0, 1.02, -1.2));

  // ---------------- Kirkkotie (village street) ----------------
  // west side, fronts face +x (rot = +90°)
  const parts = building(root, { x: 540, z: 113, rot: Math.PI / 2, w: 11, d: 8, title: 'RAUTAOSA — VARAOSAT', signBg: '#1a3a7a', y: T });
  counter(parts, 0, -1.4, 3); shelfRow(parts, -4.2, -2.4, 3); shelfRow(parts, 4.2, -2.4, 3);
  game.npcSpots.parts = parts.localToWorld(new THREE.Vector3(0, 0, -2.3));
  game.partsCounter = parts.localToWorld(new THREE.Vector3(0, 1.02, -1.4));
  const post = building(root, { x: 540, z: 148, rot: Math.PI / 2, w: 9, d: 7, title: 'POSTI', signBg: '#d08a10', y: T });
  counter(post, 0, -1.2, 3);
  for (let i = 0; i < 6; i++) box(post, 0.4, 0.3, 0.3, MAT.cardboard, -3 + (i % 3) * 0.5, 0.15 + Math.floor(i / 3) * 0.3, -2.8);
  game.npcSpots.post = post.localToWorld(new THREE.Vector3(0, 0, -2.0));
  game.postCounter = post.localToWorld(new THREE.Vector3(0, 1.02, -1.2));
  const groc = building(root, { x: 541, z: 183, rot: Math.PI / 2, w: 11, d: 8, title: 'KYLÄN KAUPPA', signBg: '#2a7a2a', y: T });
  counter(groc, -3, -1.6, 2.4); shelfRow(groc, 2, -2.6, 3); shelfRow(groc, 4.4, -2.6, 3);
  game.npcSpots.grocery = groc.localToWorld(new THREE.Vector3(-3, 0, -2.4));
  game.groceryCounter = groc.localToWorld(new THREE.Vector3(-3, 1.02, -1.6));
  // east side, fronts face -x
  const shop = building(root, { x: 596, z: 112, rot: -Math.PI / 2, w: 14, d: 11, h: 4.4, title: 'ESAN KORJAAMO & MAALAAMO', signBg: '#5a2a7a', garageDoor: 4.2, y: T });
  solid(shop, 3, 0.9, 0.7, MAT.wood, -4.5, 0.45, -4.6, { surface: true });
  game.npcSpots.mechanic = shop.localToWorld(new THREE.Vector3(-4.5, 0, -3.6));
  game.npcSpots.painter = shop.localToWorld(new THREE.Vector3(4.6, 0, -3.8));
  const booth = box(shop, 4.6, 3.4, 0.1, new THREE.MeshStandardMaterial({ color: 0xe8e8f0, transparent: true, opacity: 0.35 }), 4.4, 1.7, -1.5);
  sign(shop, 'MAALAAMO', 2, 0.4, 4.4, 3.6, -1.44, '#5a2a7a');
  game.workshopBench = shop.localToWorld(new THREE.Vector3(-4.5, 0.92, -4.6));
  game.workshopStandPos = shop.localToWorld(new THREE.Vector3(-1.5, 0, -3.5));
  const insp = building(root, { x: 603, z: 152, rot: -Math.PI / 2, w: 12, d: 8, h: 4.2, title: 'KATSASTUS', signBg: '#0a6a6a', garageDoor: 4, y: T });
  for (const s of [-1, 1]) box(insp, 0.15, 0.02, 7, MAT.yellowPaint, s * 1.3, 0.02, 0);
  game.npcSpots.inspector = insp.localToWorld(new THREE.Vector3(3.5, 0, -2.8));
  game.inspectionLane = insp.localToWorld(new THREE.Vector3(0, 0, 0.5));
  const hq = building(root, { x: 610, z: 190, rot: -Math.PI / 2, w: 10, d: 7, title: 'RALLI-HQ', signBg: '#a01818', y: T });
  counter(hq, 0, -1.2, 3);
  const board = sign(hq, 'SM-SARJA', 2.2, 1.2, -3, 1.8, -3.38, '#222', '#ffd070');
  game.npcSpots.organizer = hq.localToWorld(new THREE.Vector3(0, 0, -2.1));
  // service park (gravel lot with tents) behind HQ
  const sp = new THREE.Group(); sp.position.set(632, T, 222); root.add(sp);
  for (const [x, c] of [[-6, 0xa01818], [0, 0x1a3a7a], [6, 0xd0a020]]) {
    const tm = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide });
    box(sp, 4.6, 0.08, 4, tm, x, 2.6, 0);
    for (const sx of [-2.2, 2.2]) for (const sz of [-1.9, 1.9]) box(sp, 0.06, 2.6, 0.06, MAT.chrome, x + sx, 1.3, sz);
  }
  sign(sp, 'HUOLTO / SERVICE PARK', 4, 0.6, 0, 3.2, 2.05, '#222', '#ffd070');
  game.servicePark = sp.position.clone();
  game.npcSpots.service = sp.localToWorld(new THREE.Vector3(0, 0, -1));
  for (const [x, z] of [[-6, -1], [6, -1]]) { box(sp, 0.9, 0.9, 0.6, MAT.redPaint, x, 0.45, z - 1.2); for (let i = 0; i < 3; i++) cyl(sp, 0.3, 0.2, MAT.tire, x + 1.2, 0.1 + i * 0.21, z - 1.3, 'y', 14); }
  // notice board at the junction
  const nb = new THREE.Group(); nb.position.set(574, T, 96); nb.rotation.y = Math.PI; root.add(nb);
  for (const sx of [-0.8, 0.8]) box(nb, 0.1, 2, 0.1, MAT.wood, sx, 1, 0);
  box(nb, 1.8, 1.1, 0.06, MAT.wood, 0, 1.5, 0);
  for (let i = 0; i < 5; i++) box(nb, 0.3, 0.38, 0.01, MAT.paper, -0.6 + i * 0.3, 1.5 + (i % 2) * 0.1, -0.035);
  sign(nb, 'ILMOITUKSET', 1.6, 0.25, 0, 2.15, -0.04, '#5a3a1a', '#fff', Math.PI);
  interact(nb, { prompt: () => '<span class="k">E</span>Read the notice board (jobs)', use: () => game.ui.openJobs() });
  // village dressing: houses, lamps, benches
  const houses = [[528, 230, Math.PI / 2, 0xc8a050, 'Virtanen'], [610, 245, -Math.PI / 2, 0x8a3a2a, 'Laine'], [545, 262, Math.PI / 2, 0x6a8aa8, 'Heikkinen'], [500, 150, 0, 0xd8d0b0, 'Koskinen'], [640, 140, -Math.PI / 2, 0xb8c070, 'Salo']];
  for (const [x, z, r, c, n] of houses) {
    house(root, x, z, r, c, T);
    const off = new THREE.Vector3(0, 0, 6).applyAxisAngle(new THREE.Vector3(0, 1, 0), r);
    mailbox(game, root, 'mb_' + n.toLowerCase(), n, x + off.x, z + off.z, r);
  }
  for (let i = 0; i < 6; i++) { const z = 95 + i * 30; for (const x of [553, 572]) { const l = new THREE.Group(); l.position.set(x + (z > 200 ? (x < 560 ? 4 : 8) : 0), T, z); root.add(l); cyl(l, 0.06, 4.5, MAT.darkSteel, 0, 2.25, 0, 'y', 6); const bulb = box(l, 0.4, 0.15, 0.25, mats.fluoro, 0, 4.5, 0); bulb.material = mats.fluoro; } }
  // church tower for silhouette
  const ch = new THREE.Group(); ch.position.set(520, T, 215); root.add(ch);
  solid(ch, 7, 6, 11, mats.white, 0, 3, 0); solid(ch, 3, 12, 3, mats.white, 0, 6, -6.5);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 4), mats.roof); spire.position.set(0, 15, -6.5); spire.rotation.y = Math.PI / 4; ch.add(spire);
  for (const s of [1, -1]) { const r = box(ch, 7.6, 0.1, 6.2, mats.roof, 0, 7.2, s * 0); r.rotation.z = s * 0.6; r.position.x = s * 1.6; r.scale.set(0.55, 1, 1.95); }

  // ---------------- scrapyard ----------------
  const S = zh('scrapyard');
  const sy = new THREE.Group(); sy.position.set(-470, S, 225); root.add(sy);
  const fenceM = new THREE.MeshStandardMaterial({ color: 0x6a6a60, roughness: 0.9, metalness: 0.4, transparent: true, opacity: 0.85 });
  for (const [x0, z0, x1, z1] of [[-45, -40, -6, -40], [6, -40, 45, -40], [-45, 40, 45, 40], [-45, -40, -45, 40], [45, -40, 45, 40]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    solid(sy, Math.abs(x1 - x0) || 0.1, 2.2, Math.abs(z1 - z0) || 0.1, fenceM, mx, 1.1, mz);
  }
  sign(sy, 'ROMU-RAIMO — OSTO & MYYNTI', 7, 0.8, 0, 3, -40.1, '#5a4a1a', '#ffe0a0', Math.PI);
  // junk cars
  const r = mulberry32(77);
  const junkM = [MAT.rust, new THREE.MeshStandardMaterial({ color: 0x5a6a3a, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x7a2a1a, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.9 })];
  for (let i = 0; i < 14; i++) {
    const x = -38 + (i % 7) * 11 + r() * 2, z = (i < 7 ? 18 : 30) + r() * 3;
    const jc = new THREE.Group(); jc.position.set(x, 0, z); jc.rotation.y = r() * 0.6 - 0.3; sy.add(jc);
    const m = junkM[i % 4];
    solid(jc, 1.7, 0.7, 4, m, 0, 0.55, 0); solid(jc, 1.45, 0.5, 1.9, m, 0, 1.15, -0.3, { collide: false });
    if (r() < 0.5) { jc.rotation.z = 0.15; }
    if (i % 3 === 0) { const top = new THREE.Group(); top.position.y = 1.5; jc.add(top); solid(top, 1.6, 0.6, 3.6, junkM[(i + 1) % 4], 0, 0.3, 0, { collide: false }); top.rotation.y = 0.3; }
  }
  for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) cyl(sy, 0.3, 0.17, MAT.tire, 30 + (i % 4) * 0.7, 0.09 + k * 0.18, -30 + Math.floor(i / 4) * 0.7, 'y', 12);
  // cabin
  const cab = building(sy, { x: -30, z: -20, rot: Math.PI / 2, w: 6, d: 5, h: 2.8, title: 'TOIMISTO', signBg: '#5a4a1a', y: 0 });
  counter(cab, 0, -0.9, 2.2);
  game.npcSpots.scrap = cab.localToWorld(new THREE.Vector3(0, 0, -1.6));
  // scale platform
  const scale = new THREE.Group(); scale.position.set(-12, 0, -20); sy.add(scale);
  const plate = box(scale, 4, 0.12, 3, MAT.darkSteel, 0, 0.06, 0); plate.userData.surface = true;
  sign(scale, 'VAAKA / SCALE', 1.6, 0.4, 0, 1.4, -1.6, '#333', '#ffd070');
  box(scale, 0.08, 1.2, 0.08, MAT.darkSteel, 0, 0.6, -1.6);
  game.scrapScale = { center: scale.getWorldPosition(new THREE.Vector3()), half: [2.2, 1.7] };
  // used-part racks
  game.scrapRacks = [];
  for (let i = 0; i < 3; i++) {
    const rk = new THREE.Group(); rk.position.set(8 + i * 7, 0, -32); sy.add(rk);
    for (const y of [0.05, 0.8, 1.5]) { const sh = solid(rk, 5, 0.06, 1.2, MAT.wood, 0, y, 0, { surface: true, collide: y < 0.1 }); }
    for (const sx of [-2.4, 2.4]) box(rk, 0.08, 1.6, 1.2, MAT.darkSteel, sx, 0.8, 0);
    game.scrapRacks.push(rk);
  }
  addCollider(-470 + 4, S, 225 - 33, -470 + 26, S + 1.6, 225 - 31, {});

  // ---------------- farms ----------------
  const P = zh('pertti');
  house(root, -215, 120, 0, 0xa83a2a, P);
  const barn = new THREE.Group(); barn.position.set(-190, P, 132); root.add(barn);
  solid(barn, 10, 5, 7, mats.planks, 0, 2.5, 0);
  for (const s of [1, -1]) { const rf = box(barn, 10.6, 0.1, 4.4, mats.roof, 0, 5.8, s * 1.9); rf.rotation.x = s * 0.6; }
  mailbox(game, root, 'mb_pertti', 'Pertti', -201, 62, 0);
  game.lawn = { x: -224, z: 100, w: 16, d: 10, y: P };
  game.npcSpots.pertti = new THREE.Vector3(-212, P, 112);
  const M = zh('makela');
  house(root, 322, 132, Math.PI, 0xd8c890, M);
  const barn2 = new THREE.Group(); barn2.position.set(340, M, 136); root.add(barn2);
  solid(barn2, 8, 4.5, 6, mats.planks, 0, 2.25, 0);
  mailbox(game, root, 'mb_makela', 'Mäkelä', 336, 88, Math.PI);
  mailbox(game, root, 'mb_jc', 'JC', 1.6, 42, 0);
  game.npcSpots.makela = new THREE.Vector3(326, M, 122);

  // big fields for the farms (fences)
  root.traverse((o) => { if (o.isMesh && o.castShadow === false && !o.userData.glass) o.castShadow = true; });
  return root;
}
