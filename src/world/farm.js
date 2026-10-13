// Kivelä farm, up the farm road south of Route 54. Isäntä Kivelä has two jobs a day:
//  - plough the stubble field with the tractor (F lowers / raises the plough)
//  - morning chores: carry hay bales from the barn to the cows' troughs and collect the eggs
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { ZONES } from './terrain.js';
import { addCollider, ENV } from './colliders.js';
import { labelTex } from '../core/textures.js';
import { personModel, npcFace } from './npc.js';
import { WorkVehicle } from '../vehicles/workvehicle.js';
import { mulberry32 } from '../core/util.js';

const K = (k) => `<span class="k">${k}</span>`;
const C = { x: 230, z: 305 };
const FIELD = { x0: 200, z0: 318, w: 40, d: 30, cell: 2 };
const NX = FIELD.w / FIELD.cell, NZ = FIELD.d / FIELD.cell;
const PAY = { plough: 220, chores: 110 }, EGGS = 6;
// a pitched roof: ridge along x, w long, d deep, h high, eaves at y
function gable(R, x, y, z, w, d, h, mat) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); geo.translate(0, 0, -w / 2); geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; R.add(m); return m;
}

export class Farm {
  constructor(game) {
    this.game = game;
    this.rnd = mulberry32(5150);
    this.Y = ZONES.find((z) => z.id === 'farm').h;
    this.root = new THREE.Group(); game.scene.add(this.root);
    this.job = null;          // { kind: 'plough' | 'chores', day }
    this.paid = { plough: -1, chores: -1 };
    this.carrying = false;
    this.cells = new Uint8Array(NX * NZ);
    this.buildYard();
    this.buildField();
    this.buildAnimals();
    this.buildTractor();
    game.farmPos = new THREE.Vector3(C.x, this.Y, C.z);
  }
  person(shirt, pants, x, z, ry, hat = null) {
    const m = personModel(shirt, pants, npcFace(this.rnd, Math.floor(this.rnd() * 7)), hat);
    m.g.position.set(x, this.Y, z); m.g.rotation.y = ry; this.root.add(m.g); return m;
  }

  // ---------------- buildings ----------------
  buildYard() {
    const R = this.root, Y = this.Y;
    const red = new THREE.MeshStandardMaterial({ color: 0x8a2018, roughness: 0.9 }), white = new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.8 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.85 });
    const solid = (w, h, d, m, x, y, z) => { const b = box(R, w, h, d, m, x, y, z); addCollider(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2); return b; };
    // farmhouse
    solid(9, 3.4, 7, red, 212, Y + 1.7, 282);
    gable(R, 212, Y + 3.4, 282, 9.8, 7.8, 2.4, roofM);
    gable(R, 212, Y + 3.39, 282, 9.0, 7.0, 2.1, red);
    for (const x of [209, 215]) box(R, 1.2, 1.0, 0.06, MAT.glass, x, Y + 2.0, 285.53);
    box(R, 1.0, 2.1, 0.08, white, 212, Y + 1.05, 285.53);
    // barn, open towards the yard (west)
    const bx = 251, bz = 280;
    solid(12, 5, 0.3, red, bx, Y + 2.5, bz - 4.5); solid(12, 5, 0.3, red, bx, Y + 2.5, bz + 4.5); solid(0.3, 5, 9, red, bx + 6, Y + 2.5, bz);
    box(R, 0.3, 1.6, 9, red, bx - 6, Y + 4.2, bz);
    gable(R, bx, Y + 5, bz, 13, 10, 3, roofM);
    // hay bale stack inside the barn
    const hayM = new THREE.MeshStandardMaterial({ color: 0xd8c070, roughness: 1 });
    this.hayM = hayM;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4 - i; j++) box(R, 1.0, 0.5, 0.6, hayM, bx + 3.5, Y + 0.25 + i * 0.5, bz - 1.5 + j * 0.65 + i * 0.32);
    const stack = box(R, 1.4, 1.6, 3.0, MAT.hit, bx + 3.5, Y + 0.8, bz);
    stack.userData.interact = { prompt: () => this.hayPrompt(), use: (b) => b === 'E' && this.takeHay() };
    addCollider(bx + 3, Y, bz - 1.6, bx + 4, Y + 1.5, bz + 1.6);
    // sign at the yard entrance
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshStandardMaterial({ map: labelTex('KIVELÄN TILA · FARM', 512, 112, '#3a2a18', '#f2e2b0', 'bold 52px Arial'), roughness: 0.8 }));
    s.position.set(236, Y + 2, 252); s.rotation.y = Math.PI; R.add(s);
    for (const d of [-1.4, 1.4]) cyl(R, 0.06, 2.3, MAT.wood, 236 + d, Y + 1.15, 252.05, 'y', 6);
    // paddock fence (cows), troughs along its west side
    const P = { x0: 240, x1: 262, z0: 292, z1: 310 };
    this.pad = P;
    const rail = new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 1 });
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 2.5);
      for (let i = 0; i <= n; i++) cyl(R, 0.06, 1.3, rail, x0 + (x1 - x0) * i / n, Y + 0.65, z0 + (z1 - z0) * i / n, 'y', 6);
      for (const h of [0.6, 1.1]) box(R, Math.abs(x1 - x0) || 0.05, 0.08, Math.abs(z1 - z0) || 0.05, rail, (x0 + x1) / 2, Y + h, (z0 + z1) / 2);
      addCollider(Math.min(x0, x1) - 0.1, Y, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Y + 1.3, Math.max(z0, z1) + 0.1);
    };
    fence(P.x0, P.z0, P.x1, P.z0); fence(P.x0, P.z1, P.x1, P.z1); fence(P.x1, P.z0, P.x1, P.z1); fence(P.x0, P.z0, P.x0, P.z1);
    this.troughs = [296, 306].map((z) => {
      const t = { pos: new THREE.Vector3(P.x0 + 0.7, Y, z), filled: false };
      box(R, 0.8, 0.5, 2.2, MAT.wood, t.pos.x, Y + 0.25, z);
      t.hay = box(R, 0.6, 0.15, 2.0, hayM, t.pos.x, Y + 0.48, z); t.hay.visible = false;
      const hit = box(R, 1.4, 1.2, 2.4, MAT.hit, P.x0 - 0.1, Y + 0.6, z);
      hit.userData.interact = { prompt: () => this.troughPrompt(t), use: (b) => b === 'E' && this.fillTrough(t) };
      return t;
    });
    // chicken coop with a run of loose eggs
    box(R, 3, 2, 2.4, new THREE.MeshStandardMaterial({ color: 0xc8a060, roughness: 0.9 }), 205, Y + 1, 300); addCollider(203.5, Y, 298.8, 206.5, Y + 2, 301.2);
    const cr = box(R, 3.4, 0.15, 2.8, roofM, 205, Y + 2.15, 300); cr.rotation.z = 0.15;
    box(R, 0.5, 0.6, 0.05, new THREE.MeshStandardMaterial({ color: 0x2a1a10 }), 206.6 - 0.1, Y + 0.3, 301.23);
    const eggM = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.5 });
    const er = mulberry32(31);
    this.eggs = [];
    for (let i = 0; i < EGGS; i++) {
      const x = 205 + (er() - 0.5) * 6, z = 304 + er() * 4;
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), eggM); e.scale.y = 1.3; e.position.set(x, Y + 0.08, z); R.add(e);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), MAT.hit); hit.position.set(x, Y + 0.2, z); R.add(hit);
      const egg = { mesh: e, hit, got: false };
      hit.userData.interact = { prompt: () => (egg.got ? '' : this.job?.kind === 'chores' ? `${K('E')}Collect the egg` : 'An egg'), use: (b) => b === 'E' && this.takeEgg(egg) };
      this.eggs.push(egg);
    }
    // the farmer
    this.farmer = this.person(0x3a6a3a, 0x2a3a5a, 218, 287, Math.PI * 0.6, 0x6a5a3a);
    this.farmer.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => `${K('E')}Talk to Isäntä Kivelä <span class="dim">(farmer)</span>`, use: (b) => b === 'E' && this.talk() }; });
  }

  // ---------------- field ----------------
  buildField() {
    const R = this.root, Y = this.Y, F = FIELD;
    const stub = box(R, F.w, 0.04, F.d, new THREE.MeshStandardMaterial({ color: 0xb8a460, roughness: 1 }), F.x0 + F.w / 2, Y + 0.02, F.z0 + F.d / 2);
    stub.receiveShadow = true;
    // stubble rows
    for (let i = 0; i < 20; i++) box(R, F.w - 0.4, 0.08, 0.1, new THREE.MeshStandardMaterial({ color: 0xa08c48, roughness: 1 }), F.x0 + F.w / 2, Y + 0.06, F.z0 + 0.75 + i * 1.5);
    // ploughed soil, cell by cell
    const soil = new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 1 });
    this.soil = new THREE.InstancedMesh(new THREE.BoxGeometry(F.cell, 0.12, F.cell), soil, NX * NZ);
    this.soil.receiveShadow = true; this.soil.raycast = () => {};
    this.dummy = new THREE.Object3D();
    for (let i = 0; i < NX * NZ; i++) this.setCell(i, 0);
    R.add(this.soil);
  }
  setCell(i, on) {
    const F = FIELD, cx = i % NX, cz = Math.floor(i / NX), d = this.dummy;
    d.position.set(F.x0 + (cx + 0.5) * F.cell, this.Y + 0.07, F.z0 + (cz + 0.5) * F.cell);
    d.scale.set(1, on ? 1 : 0.001, 1); d.rotation.y = on ? (this.rnd() - 0.5) * 0.05 : 0; d.updateMatrix();
    this.soil.setMatrixAt(i, d.matrix); this.soil.instanceMatrix.needsUpdate = true;
    this.cells[i] = on ? 1 : 0;
  }
  resetField() { for (let i = 0; i < NX * NZ; i++) this.setCell(i, 0); }
  progress() { let n = 0; for (const c of this.cells) n += c; return n / this.cells.length; }
  doPlough(dt) {
    const T = this.tractor;
    if (!T.driving || !this.ploughDown || Math.abs(T.speed) < 0.3) return;
    const fwd = new THREE.Vector3(Math.sin(T.yaw), 0, Math.cos(T.yaw)), right = new THREE.Vector3(Math.cos(T.yaw), 0, -Math.sin(T.yaw));
    const base = T.pos.clone().addScaledVector(fwd, -2.9);
    let any = false;
    for (let s = -1.3; s <= 1.31; s += 0.65) {
      const p = base.clone().addScaledVector(right, s);
      const cx = Math.floor((p.x - FIELD.x0) / FIELD.cell), cz = Math.floor((p.z - FIELD.z0) / FIELD.cell);
      if (cx < 0 || cz < 0 || cx >= NX || cz >= NZ) continue;
      const i = cz * NX + cx; if (!this.cells[i]) { this.setCell(i, 1); any = true; }
      if (this.cells[i]) any = any || false;
    }
    this.dust = (this.dust || 0) - dt;
    if (any && this.dust <= 0) { this.dust = 0.25; this.game.audio.burst(300, 0.8, 0.05, 0.25, 'lowpass'); }
    if (this.job?.kind === 'plough' && this.progress() >= 0.9 && !this.toldDone) { this.toldDone = true; this.game.say('The field is ploughed! Go tell Isäntä Kivelä.', 4); }
  }

  // ---------------- animals ----------------
  buildAnimals() {
    const R = this.root, Y = this.Y, P = this.pad;
    const wht = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.9 }), blk = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xe0a0a0, roughness: 0.8 });
    this.cows = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group(); R.add(g);
      box(g, 0.9, 0.85, 1.9, wht, 0, 1.15, 0);
      box(g, 0.92, 0.5, 0.6, blk, 0, 1.3, 0.3 * (i % 2 ? 1 : -1)); box(g, 0.6, 0.3, 0.5, blk, 0.16, 1.5, -0.6);
      const head = new THREE.Group(); head.position.set(0, 1.4, 1.0); g.add(head);
      box(head, 0.45, 0.5, 0.6, i % 2 ? blk : wht, 0, 0, 0.25); box(head, 0.35, 0.25, 0.2, pink, 0, -0.15, 0.6);
      for (const s of [-1, 1]) { box(head, 0.2, 0.08, 0.1, wht, s * 0.3, 0.2, 0.15); cyl(head, 0.03, 0.15, MAT.ceramic, s * 0.15, 0.3, 0.1, 'y', 6); }
      for (const [x, z] of [[0.3, 0.7], [-0.3, 0.7], [0.3, -0.7], [-0.3, -0.7]]) cyl(g, 0.08, 0.8, wht, x, 0.4, z, 'y', 8);
      box(g, 0.3, 0.15, 0.3, pink, 0, 0.68, -0.5);
      cyl(g, 0.03, 0.7, blk, 0, 1.0, -0.98, 'y', 6).rotation.x = 0.3;
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const cow = { g, head, x: P.x0 + 5 + i * 4, z: P.z0 + 4 + (i % 2) * 8, tx: 0, tz: 0, t: this.rnd() * 5, yaw: this.rnd() * 6 };
      g.position.set(cow.x, Y, cow.z);
      const hit = box(g, 1.1, 1.6, 2.2, MAT.hit, 0, 0.9, 0); hit.userData.interact = { prompt: () => 'Cow <span class="dim">— moo</span>', use: (b) => { if (b === 'E') this.game.audio.tone(140, 'sawtooth', 0.12, 0.9, -0.3); } };
      this.cows.push(cow);
    }
    this.hens = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group(); R.add(g);
      box(g, 0.22, 0.2, 0.3, wht, 0, 0.22, 0); box(g, 0.12, 0.14, 0.12, wht, 0, 0.38, 0.14); box(g, 0.04, 0.06, 0.08, new THREE.MeshStandardMaterial({ color: 0xc02020 }), 0, 0.47, 0.14);
      box(g, 0.05, 0.04, 0.06, MAT.yellowPaint, 0, 0.36, 0.22);
      for (const s of [-0.05, 0.05]) cyl(g, 0.012, 0.12, MAT.yellowPaint, s, 0.06, 0, 'y', 4);
      const hen = { g, x: 203 + this.rnd() * 5, z: 303 + this.rnd() * 4, yaw: 0, t: this.rnd() * 4 };
      g.position.set(hen.x, Y, hen.z); this.hens.push(hen);
    }
  }
  updateAnimals(dt) {
    const Y = this.Y, P = this.pad;
    if (this.game.player.pos.distanceTo(this.game.farmPos) > 160) return;
    for (const c of this.cows) {
      c.t -= dt;
      const fed = this.troughs.find((t) => t.filled);
      if (c.t <= 0) { c.t = 4 + this.rnd() * 6; if (fed && this.rnd() < 0.7) { c.tx = fed.pos.x + 1.4; c.tz = fed.pos.z + (this.rnd() - 0.5) * 1.6; } else { c.tx = P.x0 + 2 + this.rnd() * (P.x1 - P.x0 - 4); c.tz = P.z0 + 2 + this.rnd() * (P.z1 - P.z0 - 4); } }
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { const want = Math.atan2(dx, dz); let dy = want - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, dt * 1.5); if (Math.abs(dy) < 0.6) { c.x += Math.sin(c.yaw) * dt * 0.6; c.z += Math.cos(c.yaw) * dt * 0.6; } c.head.rotation.x = 0; }
      else c.head.rotation.x = 0.5 + Math.sin(performance.now() * 0.003 + c.x) * 0.15; // grazing / eating
      c.g.position.set(c.x, Y, c.z); c.g.rotation.y = c.yaw;
    }
    for (const h of this.hens) {
      h.t -= dt;
      if (h.t <= 0) { h.t = 0.8 + this.rnd() * 2; h.yaw = this.rnd() * 6.28; h.walk = this.rnd() < 0.6; }
      if (h.walk) { h.x = Math.min(208, Math.max(202, h.x + Math.sin(h.yaw) * dt * 0.5)); h.z = Math.min(308, Math.max(302, h.z + Math.cos(h.yaw) * dt * 0.5)); }
      h.g.position.set(h.x, Y, h.z); h.g.rotation.y = h.yaw; h.g.rotation.x = h.walk ? 0 : Math.max(0, Math.sin(performance.now() * 0.012 + h.x * 9)) * 0.5;
    }
  }

  // ---------------- tractor ----------------
  buildTractor() {
    const g = this.game, red = new THREE.MeshStandardMaterial({ color: 0xb02018, roughness: 0.5, metalness: 0.2 });
    this.ploughDown = false;
    this.tractor = new WorkVehicle(g, {
      name: 'tractor', pos: new THREE.Vector3(246, this.Y, 324), yaw: -Math.PI / 2, maxSpeed: 9, accel: 2.6, turn: 1.0, len: 4.6, wid: 2.1, eye: [0, 2.35, -0.55],
      wheels: [[0.85, 1.25, 0.45, 0.3], [-0.85, 1.25, 0.45, 0.3], [0.95, -0.6, 0.75, 0.45], [-0.95, -0.6, 0.75, 0.45]],
      hint: 'F lowers / raises the plough.',
      canDrive: () => { if (this.carrying) { this.game.say('Put the hay in a trough first.'); return false; } return true; },
      build: (o) => {
        box(o, 0.9, 0.8, 2.2, red, 0, 1.15, 0.85);                                     // bonnet
        box(o, 0.92, 0.1, 0.1, MAT.chrome, 0, 1.0, 1.96);
        box(o, 1.2, 0.5, 1.2, red, 0, 1.0, -0.55);                                     // body
        box(o, 0.5, 0.15, 0.5, MAT.seat, 0, 1.6, -0.75);                               // seat
        for (const x of [-0.65, 0.65]) for (const z of [-0.05, -1.2]) box(o, 0.06, 1.4, 0.06, MAT.darkSteel, x, 2.15, z); // ROPS frame
        box(o, 1.45, 0.08, 1.3, red, 0, 2.85, -0.62);                                   // roof
        for (const s of [-1, 1]) box(o, 0.45, 0.06, 1.2, red, s * 0.95, 1.6, -0.6);    // fenders
        cyl(o, 0.06, 1.0, MAT.darkSteel, 0.48, 2.0, 1.4, 'y', 8);                        // exhaust
        cyl(o, 0.18, 0.04, MAT.blackPaint, 0, 2.0, -0.3, 'x', 14).rotation.x = 0.9;     // steering wheel
        // the plough on the three-point hitch
        const pl = new THREE.Group(); pl.position.set(0, 0.9, -1.5); o.add(pl); this.plough = pl;
        box(pl, 0.15, 0.15, 1.6, MAT.darkSteel, 0, 0, -0.8);
        box(pl, 2.4, 0.12, 0.12, MAT.darkSteel, 0, 0, -1.4);
        for (const x of [-1.0, -0.33, 0.33, 1.0]) { const sh = box(pl, 0.08, 0.6, 0.5, MAT.steel, x, -0.3, -1.45); sh.rotation.x = 0.5; }
      },
      onDriveKey: (input) => {
        if (!input.hit('KeyF')) return;
        this.ploughDown = !this.ploughDown;
        this.tractor.limit = this.ploughDown ? 4.5 : 9;
        g.audio.thunk(0.8);
        g.toast(this.ploughDown ? 'Plough down — drive over the field' : 'Plough up', 1.5);
      },
    });
  }

  // ---------------- chores ----------------
  hayPrompt() {
    if (this.job?.kind !== 'chores') return 'Hay bales';
    if (this.carrying) return 'You\'re already carrying a bale';
    return `${K('E')}Pick up a hay bale`;
  }
  takeHay() {
    const g = this.game;
    if (this.job?.kind !== 'chores') { g.say('Isäntä Kivelä\'s hay. Better ask first.'); return; }
    if (this.carrying) return;
    if (g.interaction.held) { g.say('Put down what you\'re holding first (G).'); return; }
    this.carrying = true;
    if (!this.bale) { this.bale = new THREE.Group(); box(this.bale, 0.9, 0.45, 0.5, this.hayM, 0, 0, 0); for (const x of [-0.25, 0.25]) box(this.bale, 0.02, 0.47, 0.52, MAT.rubber, x, 0, 0); this.bale.position.set(0, -0.55, -0.85); }
    g.camera.add(this.bale);
    g.audio.pickup(18); g.life.exert(2);
    g.toast('Carry the bale to an empty trough at the cow paddock (E)', 2.5);
  }
  troughPrompt(t) {
    if (t.filled) return 'Trough — full of hay';
    if (this.carrying) return `${K('E')}Put the hay in the trough`;
    return this.job?.kind === 'chores' ? 'Empty trough — bring a hay bale from the barn' : 'Cow trough';
  }
  fillTrough(t) {
    const g = this.game;
    if (t.filled || !this.carrying) return;
    this.carrying = false; g.camera.remove(this.bale);
    t.filled = true; t.hay.visible = true;
    g.audio.thunk(0.6); g.toast(`Trough filled (${this.troughs.filter((x) => x.filled).length}/${this.troughs.length})`, 2);
    this.checkChores();
  }
  takeEgg(e) {
    const g = this.game;
    if (e.got || this.job?.kind !== 'chores') return;
    e.got = true; e.mesh.visible = false; e.hit.visible = false;
    g.audio.click(0.5); g.toast(`Egg collected (${this.eggs.filter((x) => x.got).length}/${EGGS})`, 1.5);
    this.checkChores();
  }
  choresDone() { return this.troughs.every((t) => t.filled) && this.eggs.every((e) => e.got); }
  checkChores() { if (this.choresDone()) this.game.say('Chores done! Go tell Isäntä Kivelä.', 3); }
  resetChores() {
    for (const t of this.troughs) { t.filled = false; t.hay.visible = false; }
    for (const e of this.eggs) { e.got = false; e.mesh.visible = true; e.hit.visible = true; }
  }

  // ---------------- the farmer ----------------
  talk() {
    const g = this.game, h = g.life.hours, day = g.life.day, J = this.job;
    const D = (t, o) => g.ui.dialog('Isäntä Kivelä', t, o);
    if (J?.kind === 'plough') {
      if (this.progress() >= 0.9) return this.payOut('plough', 'Now that\'s a field. Straight furrows too — almost. Here you go.');
      return D(`The field's ${Math.round(this.progress() * 100)}% ploughed. Get it to at least 90 — tractor's by the field, F drops the plough.`, [{ label: 'On it', go: () => {} }]);
    }
    if (J?.kind === 'chores') {
      if (this.choresDone()) return this.payOut('chores', 'Cows are happy, eggs are in. Good worker. Here.');
      const tr = this.troughs.filter((t) => !t.filled).length, eg = this.eggs.filter((e) => !e.got).length;
      return D(`Still to do: ${tr ? `${tr} trough${tr > 1 ? 's' : ''} to fill with hay from the barn` : ''}${tr && eg ? ' and ' : ''}${eg ? `${eg} egg${eg > 1 ? 's' : ''} to collect by the hen house` : ''}.`, [{ label: 'On it', go: () => {} }]);
    }
    if (h < 6 || h >= 21) return D('It\'s the middle of the night! Come back in the morning — there\'s always work on a farm.', [{ label: 'OK', go: () => {} }]);
    const opts = [];
    if (this.paid.plough !== day) opts.push({ label: `Plough the stubble field with the tractor — ${PAY.plough} mk`, go: () => this.start('plough') });
    if (this.paid.chores !== day) opts.push({ label: `Chores: feed the cows & collect the eggs — ${PAY.chores} mk`, go: () => this.start('chores') });
    if (!opts.length) return D('You\'ve done everything for today. Come back tomorrow!', [{ label: 'See you', go: () => {} }]);
    D('Morning! Always more work than hands here. What do you fancy?', [...opts, { label: 'Not today', go: () => {} }]);
  }
  start(kind) {
    const g = this.game;
    this.job = { kind, day: g.life.day };
    if (kind === 'plough') { this.resetField(); this.toldDone = false; if (!this.tractor.driving && this.tractor.pos.distanceTo(this.tractor.home.pos) > 60) this.tractor.reset(); g.say('Isäntä Kivelä: "Tractor\'s by the field. Drop the plough with F and go up and down till it\'s all brown."', 5); }
    else { this.resetChores(); g.say('Isäntä Kivelä: "Hay\'s in the barn, two troughs at the paddock. Eggs are wherever the hens left them."', 5); }
    g.jobs.focus = 'farm';
  }
  payOut(kind, text) {
    const g = this.game;
    this.paid[kind] = g.life.day; this.job = null;
    if (g.jobs.focus === 'farm') g.jobs.focus = null;
    g.addMoney(PAY[kind], kind === 'plough' ? 'Kivelä farm: ploughed the field' : 'Kivelä farm: morning chores');
    if (kind === 'plough') g.ach?.unlock('farmhand');
    g.ui.dialog('Isäntä Kivelä', `${text} (${PAY[kind]} mk)`, [{ label: 'Thanks', go: () => {} }]);
  }
  cancel() {
    if (this.carrying) { this.carrying = false; this.game.camera.remove(this.bale); }
    if (this.tractor.driving && this.ploughDown) { this.ploughDown = false; this.tractor.limit = 9; }
    this.job = null;
    this.game.say('You called Isäntä Kivelä: "No matter. The work will still be here tomorrow."', 4);
  }

  update(dt, input) {
    this.tractor.update(dt, input);
    if (this.plough) this.plough.position.y += ((this.ploughDown ? 0.55 : 0.95) - this.plough.position.y) * Math.min(1, dt * 4);
    this.doPlough(dt);
    this.updateAnimals(dt);
  }

  // ---------------- job objective (shown in the guide) ----------------
  objective(mark, dist, also) {
    const J = this.job, T = this.tractor, here = this.game.player.pos;
    if (!J) return null;
    const far = here.distanceTo(this.game.farmPos) > 110;
    if (J.kind === 'plough') {
      const pct = Math.round(this.progress() * 100);
      if (pct >= 90) return { job: 'FARM JOB', st: { title: 'Field ploughed — get paid' }, s: { text: `Talk to Isäntä Kivelä at the farmhouse (E) for your ${PAY.plough} mk.${also}`, targets: [mark(this.farmer.g.position, 'Isäntä Kivelä', '#4ad8ff', 1.9)] } };
      if (far && !T.driving) return { job: 'FARM JOB', st: { title: 'Drive to Kivelä farm' }, s: { text: `The farm is up the farm road south of Route 54 (${dist(this.game.farmPos)} m).${also}`, targets: [mark(this.game.farmPos, 'Kivelä farm', '#4ad8ff', 3)] } };
      if (!T.driving) return { job: 'FARM JOB', st: { title: `Plough the field (${pct}%)` }, s: { text: `Get on the red tractor by the field (E).${also}`, targets: [mark(T.pos, 'Tractor', '#ffd23c', 3)] } };
      if (!this.ploughDown) return { job: 'FARM JOB', st: { title: `Plough the field (${pct}%)` }, s: { text: 'Drive onto the stubble field and press F to lower the plough.', targets: [mark(new THREE.Vector3(FIELD.x0 + FIELD.w / 2, this.Y, FIELD.z0 + FIELD.d / 2), 'Field', '#4ad8ff', 1)] } };
      // nearest unploughed patch
      let best = null, bd = 1e9;
      this.cells.forEach((c, i) => { if (c) return; const x = FIELD.x0 + (i % NX + 0.5) * FIELD.cell, z = FIELD.z0 + (Math.floor(i / NX) + 0.5) * FIELD.cell; const d = (x - T.pos.x) ** 2 + (z - T.pos.z) ** 2; if (d < bd) { bd = d; best = new THREE.Vector3(x, this.Y, z); } });
      return { job: 'FARM JOB', st: { title: `Plough the field (${pct}%)` }, s: { text: `Drive up and down until at least 90% is brown soil. The plough is behind you — overlap your rows a little.${also}`, targets: best ? [mark(best, 'Unploughed', '#4ad8ff', 0.4)] : [] } };
    }
    if (this.choresDone()) return { job: 'FARM JOB', st: { title: 'Chores done — get paid' }, s: { text: `Talk to Isäntä Kivelä (E) for your ${PAY.chores} mk.${also}`, targets: [mark(this.farmer.g.position, 'Isäntä Kivelä', '#4ad8ff', 1.9)] } };
    if (far) return { job: 'FARM JOB', st: { title: 'Drive to Kivelä farm' }, s: { text: `The farm is up the farm road south of Route 54 (${dist(this.game.farmPos)} m).${also}`, targets: [mark(this.game.farmPos, 'Kivelä farm', '#4ad8ff', 3)] } };
    const tr = this.troughs.filter((t) => !t.filled), eg = this.eggs.filter((e) => !e.got);
    const status = `Troughs ${this.troughs.length - tr.length}/${this.troughs.length} · eggs ${EGGS - eg.length}/${EGGS}`;
    if (this.carrying) return { job: 'FARM JOB', st: { title: 'Put the hay in a trough' }, s: { text: `${status}. Look at an empty trough at the paddock fence and press E.${also}`, targets: tr.map((t) => mark(t.pos, 'Empty trough', '#4ad8ff', 0.8)) } };
    if (tr.length) return { job: 'FARM JOB', st: { title: 'Feed the cows' }, s: { text: `${status}. Grab a hay bale from the stack in the barn (E).${eg.length ? ' The eggs are by the hen house.' : ''}${also}`, targets: [mark(new THREE.Vector3(254.5, this.Y, 280), 'Hay bales', '#ffd23c', 1.8)] } };
    return { job: 'FARM JOB', st: { title: `Collect the eggs (${EGGS - eg.length}/${EGGS})` }, s: { text: `${status}. They're on the ground around the hen house — press E on each.${also}`, targets: eg.slice(0, 3).map((e) => mark(e.mesh.position, 'Egg', '#ffd23c', 0.3)) } };
  }

  serialize() { return { job: this.job, paid: this.paid, cells: Array.from(this.cells).join(''), plough: this.ploughDown, tractor: this.tractor.serialize(), troughs: this.troughs.map((t) => t.filled), eggs: this.eggs.map((e) => e.got) }; }
  restore(d) {
    if (!d) return;
    this.job = d.job || null; this.paid = { plough: -1, chores: -1, ...d.paid };
    if (d.cells) for (let i = 0; i < this.cells.length; i++) this.setCell(i, d.cells[i] === '1');
    this.tractor.restore(d.tractor);
    (d.troughs || []).forEach((f, i) => { const t = this.troughs[i]; if (t) { t.filled = f; t.hay.visible = f; } });
    (d.eggs || []).forEach((got, i) => { const e = this.eggs[i]; if (e) { e.got = got; e.mesh.visible = !got; e.hit.visible = !got; } });
  }
}
