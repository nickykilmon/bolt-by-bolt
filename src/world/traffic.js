// Road traffic on Route 54: cars drive in the right-hand lane, slow for curves and town,
// brake for things in their lane, overtake parked obstacles, and kill you if they hit you.
// On rally day (Saturday) rally cars also tear along every road and stage, flat out.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { ROADS, groundY, zoneAt } from './terrain.js';
import { clamp } from '../core/util.js';
import { labelTex } from '../core/textures.js';
import { mergeByMaterial } from '../core/merge.js';

const COLORS = [0xb02020, 0x2050a0, 0xd8d8d0, 0x303438, 0x2a6a3a, 0xc8a030, 0x6a2a6a, 0x8a8f96];
const LANE = 1.8;
const tmp = new THREE.Vector3();

// side profile of a 70s/80s saloon: [along the car (z), height]
const PROFILE = [[2.18, 0.34], [2.2, 0.62], [2.12, 0.78], [1.95, 0.84], [0.95, 0.9], [0.32, 1.36], [-1.05, 1.38], [-1.62, 0.98], [-2.12, 0.92], [-2.2, 0.78], [-2.18, 0.34]];
const W = 1.68;
const glassM = new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.2, side: THREE.DoubleSide });
const trimM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
const rimM = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 });
let bodyGeo = null, sideWinGeo = null;
function sharedGeos() {
  if (bodyGeo) return;
  const sh = new THREE.Shape(); PROFILE.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y))); sh.closePath();
  bodyGeo = new THREE.ExtrudeGeometry(sh, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 4 });
  bodyGeo.rotateY(-Math.PI / 2).translate((W - 0.12) / 2, 0, 0); // shape x -> car z, extrusion -> car x, centred
  const w = new THREE.Shape(); [[0.86, 0.94], [0.32, 1.31], [-1.0, 1.32], [-1.5, 0.99]].forEach(([z, y], i) => (i ? w.lineTo(z, y) : w.moveTo(z, y))); w.closePath();
  sideWinGeo = new THREE.ShapeGeometry(w).rotateY(-Math.PI / 2);
}
function slab(o, a, b, mat, inset = 0.06) { // glass pane between two profile points, across the car
  const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.22, len - inset * 2), mat);
  const phi = Math.atan2(dz, dy); // plane's up axis along the slope; normal ends up pointing outwards
  m.rotation.x = phi;
  m.position.set(0, (a[1] + b[1]) / 2 - Math.sin(phi) * 0.012, (a[0] + b[0]) / 2 + Math.cos(phi) * 0.012);
  o.add(m); return m;
}

function carModel(color, lamps, tails) {
  sharedGeos();
  const o = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const body = new THREE.Mesh(bodyGeo, paint); o.add(body);
  // glass: windscreen, rear screen, side windows (on both flanks)
  slab(o, PROFILE[4], PROFILE[5], glassM);
  slab(o, PROFILE[6], PROFILE[7], glassM);
  for (const s of [-1, 1]) { const sw = new THREE.Mesh(sideWinGeo, glassM); sw.position.x = s * (W / 2 + 0.002); o.add(sw); }
  // pillars between the side windows, rubbing strips, door gaps, mirrors, handles
  for (const s of [-1, 1]) {
    box(o, 0.02, 0.38, 0.06, paint, s * (W / 2 + 0.004), 1.12, -0.32);
    box(o, 0.02, 0.05, 3.6, trimM, s * (W / 2 + 0.01), 0.62, 0);
    box(o, 0.012, 0.5, 0.012, trimM, s * (W / 2 + 0.006), 0.6, 0.92);
    box(o, 0.012, 0.5, 0.012, trimM, s * (W / 2 + 0.006), 0.6, -0.36);
    box(o, 0.012, 0.03, 0.12, rimM, s * (W / 2 + 0.012), 0.8, 0.55);
    box(o, 0.1, 0.07, 0.05, trimM, s * (W / 2 + 0.06), 0.98, 0.9);
  }
  // front: grille, lamps, bumper, plate; rear: lamps, bumper, plate
  box(o, 0.9, 0.2, 0.03, trimM, 0, 0.66, 2.215);
  for (const s of [-1, 1]) { cyl(o, 0.09, 0.03, rimM, s * 0.62, 0.66, 2.205, 'z', 14); cyl(o, 0.075, 0.035, lamps, s * 0.62, 0.66, 2.215, 'z', 14); box(o, 0.32, 0.12, 0.03, tails, s * 0.58, 0.72, -2.215); }
  box(o, W + 0.04, 0.14, 0.12, rimM, 0, 0.42, 2.24);
  box(o, W + 0.04, 0.14, 0.12, rimM, 0, 0.42, -2.24);
  box(o, 0.42, 0.11, 0.01, MAT.whitePlastic, 0, 0.5, 2.305); box(o, 0.42, 0.11, 0.01, MAT.whitePlastic, 0, 0.6, -2.305);
  // dark wheel wells
  for (const z of [1.35, -1.35]) box(o, W + 0.02, 0.28, 0.78, trimM, 0, 0.44, z);
  const wheels = [];
  for (const [x, z] of [[-0.78, 1.35], [0.78, 1.35], [-0.78, -1.35], [0.78, -1.35]]) {
    const w = new THREE.Group(); w.position.set(x, 0.32, z); o.add(w);
    cyl(w, 0.32, 0.2, MAT.tire, 0, 0, 0, 'x', 18); cyl(w, 0.2, 0.21, rimM, 0, 0, 0, 'x', 14); cyl(w, 0.07, 0.22, trimM, 0, 0, 0, 'x', 8);
    wheels.push(w);
  }
  o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.raycast = () => {}; } });
  mergeByMaterial(o, (m) => !wheels.some((w) => { for (let p = m.parent; p; p = p.parent) if (p === w) return true; return false; }));
  return { o, wheels };
}
// rally car: same shell with stripes, a roof scoop, a wing, mud flaps and door numbers
function rallyModel(color, num, lamps, tails) {
  const r = carModel(color, lamps, tails), o = r.o;
  const stripe = new THREE.MeshStandardMaterial({ color: num % 2 ? 0x1060d0 : 0xe8c020, roughness: 0.5 });
  box(o, 0.42, 0.012, 1.0, stripe, 0, 0.9, 1.45).rotation.x = -0.06;
  box(o, 0.42, 0.012, 1.3, stripe, 0, 1.385, -0.37);
  box(o, 0.3, 0.1, 0.4, MAT.darkSteel, 0, 1.43, 0.0);
  box(o, 1.6, 0.04, 0.32, MAT.darkSteel, 0, 1.16, -1.95);
  for (const sx of [-0.6, 0.6]) box(o, 0.04, 0.22, 0.04, MAT.darkSteel, sx, 1.03, -1.95);
  for (const s of [-1, 1]) { box(o, 0.3, 0.26, 0.015, trimM, s * 0.72, 0.2, -1.74); box(o, 0.3, 0.26, 0.015, trimM, s * 0.72, 0.2, 0.95); }
  for (const s of [-1, 1]) cyl(o, 0.09, 0.06, lamps, s * 0.3, 0.86, 2.0, 'z', 12); // spot lamps
  const tex = labelTex(String(num), 128, 128, '#ffffff', '#111', 'bold 90px Impact');
  for (const sd of [-1, 1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshStandardMaterial({ map: tex }));
    pl.position.set(sd * (W / 2 + 0.012), 0.6, 0.28); pl.rotation.y = sd * Math.PI / 2; o.add(pl);
  }
  o.traverse((m) => { if (m.isMesh) m.raycast = () => {}; });
  const wheels = r.wheels;
  mergeByMaterial(o, (m) => !wheels.some((w) => { for (let p = m.parent; p; p = p.parent) if (p === w) return true; return false; }));
  return r;
}

export class Traffic {
  constructor(game) {
    this.game = game;
    // routes: a road plus the cumulative distance along its samples
    this.routes = ROADS.filter((r) => r.name !== 'Driveway').map((road) => {
      const s = road.samples, dist = [0];
      for (let i = 1; i < s.length; i++) dist.push(dist[i - 1] + Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z));
      return { road, dist, len: dist[dist.length - 1] };
    }).filter((R) => R.len > 150);
    this.main = this.routes.find((R) => R.road.name === 'Route 54');
    this.lamps = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff2c0, emissiveIntensity: 0, roughness: 0.2 });
    this.tails = new THREE.MeshStandardMaterial({ color: 0x801010, emissive: 0xff1010, emissiveIntensity: 0, roughness: 0.3 });
    this.cars = [];
    const n = 9;
    for (let k = 0; k < n; k++) {
      const { o, wheels } = carModel(COLORS[k % COLORS.length], this.lamps, this.tails);
      game.scene.add(o);
      const dir = k % 2 ? 1 : -1;
      const c = { o, wheels, R: this.main, dir, d: (k + 0.5) / n * this.main.len, v: 15, ot: 0, cruise: 16 + (k * 7 % 5) * 1.3, off: 0, offT: 0, stuck: 0, hidden: 0, pos: new THREE.Vector3(), fwd: new THREE.Vector3(), yaw: 0 };
      this.cars.push(c);
      this.place(c);
    }
    // rally cars (only out on Saturdays): spread over every road and stage
    const rallyRoutes = [this.main, this.main, this.main, ...this.routes.filter((R) => R !== this.main), ...this.routes.filter((R) => R.road.stage)];
    rallyRoutes.forEach((R, k) => {
      const { o, wheels } = rallyModel([0xf0f0f0, 0xd02020, 0x1a1a1a, 0x2050c0, 0xe07010][k % 5], 11 + k * 3, this.lamps, this.tails);
      o.visible = false; game.scene.add(o);
      this.cars.push({ o, wheels, R, home: R, rally: true, dir: k % 2 ? 1 : -1, d: 0, v: 20, cruise: 27 + Math.random() * 10, ph: Math.random() * 9, off: 0, ot: 0, hidden: 0, out: true, pos: new THREE.Vector3(), fwd: new THREE.Vector3(), yaw: 0, slip: 0 });
    });
  }
  rallyDay() { const L = this.game.life; return L.day % 7 === 5 && L.hours >= 8 && L.hours < 20; }
  // position and heading on route R at distance d (along sample order)
  at(R, d, out) {
    const s = R.road.samples, D = R.dist;
    d = clamp(d, 0, R.len - 0.01);
    let lo = 0, hi = D.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m; else hi = m; }
    const a = s[lo], b = s[hi], t = (d - D[lo]) / Math.max(1e-6, D[hi] - D[lo]);
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
    out.dx = b.x - a.x; out.dz = b.z - a.z;
    const l = Math.hypot(out.dx, out.dz) || 1; out.dx /= l; out.dz /= l;
    return out;
  }
  place(c) {
    const p = this.at(c.R, c.d, {});
    const fx = p.dx * c.dir, fz = p.dz * c.dir;
    const lat = (c.rally ? 0 : LANE) + c.off; // right-hand lane; negative offset = overtaking lane. Rally cars use the whole road
    const x = p.x - fz * lat, z = p.z + fx * lat;
    c.fwd.set(fx, 0, fz);
    c.yaw = Math.atan2(fx, fz);
    const yF = groundY(x + fx * 1.4, z + fz * 1.4), yR = groundY(x - fx * 1.4, z - fz * 1.4);
    c.pos.set(x, (yF + yR) / 2, z);
    c.o.position.copy(c.pos);
    c.o.rotation.set(0, c.yaw + (c.slip || 0), 0, 'YXZ');
    c.o.rotateX(-Math.atan2(yF - yR, 2.8));
  }
  // curvature ahead → safe speed
  curveSpeed(c) {
    const a = this.at(c.R, c.d, {}), b = this.at(c.R, c.d + c.dir * 30, {});
    const turn = Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz);
    c.turn = turn * c.dir;
    return c.rally ? clamp(36 - Math.abs(turn) * 20, 14, 38) : clamp(22 - Math.abs(turn) * 30, 8, 22);
  }
  // things the cars can hit / brake for: [{pos, r, kind}]
  targets() {
    const g = this.game, out = [];
    if (g.moped.riding) out.push({ pos: g.moped.pos, r: 0.7, kind: 'moped' });
    else if (!g.player.inCar) out.push({ pos: g.player.pos, r: 0.35, kind: 'foot' });
    const cp = g.car.chassis.obj.position, cf = tmp.set(0, 0, 1).applyQuaternion(g.car.chassis.obj.quaternion);
    for (const k of [-1.4, 0, 1.4]) out.push({ pos: cp.clone().addScaledVector(cf, k), r: 0.95, kind: g.player.inCar ? 'car' : 'parked' });
    if (!g.moped.riding) out.push({ pos: g.moped.pos, r: 0.6, kind: 'parked' });
    return out;
  }
  update(dt) {
    const g = this.game;
    const night = 1 - clamp(((g.sky.dayLight ?? 1) - 0.15) / 0.3, 0, 1);
    this.lamps.emissiveIntensity = night * 2.5; this.tails.emissiveIntensity = 0.3 + night * 1.2;
    if (g.profile?.traffic === false) { if (!this.off) { this.off = true; for (const c of this.cars) c.o.visible = false; } return; }
    const T = this.targets(), me = g.camera.position;
    let nearD = Infinity, nearV = 0, nearRally = false;
    const rallyOn = this.rallyDay();
    if (rallyOn !== this.rallyWas) {
      if (rallyOn && this.rallyWas !== undefined) g.say('It\'s rally day! Rally cars are out on every road and stage — watch yourself.', 6);
      this.rallyWas = rallyOn;
    }
    for (const c of this.cars) {
      if (c.rally) {
        if (!rallyOn) { if (!c.out) { c.out = true; c.o.visible = false; } continue; }
        if (c.out) { c.out = false; c.R = c.home; c.d = 5 + Math.random() * (c.R.len - 10); c.hidden = Math.random() * 3; }
        if (c.hidden > 0) { c.hidden -= dt; c.o.visible = c.hidden <= 0; continue; }
        if (this.driveRally(c, dt, T)) return;
        const dn = c.pos.distanceTo(me);
        if (dn < nearD) { nearD = dn; nearV = c.v; nearRally = true; }
        continue;
      }
      if (c.hidden > 0) { c.hidden -= dt; c.o.visible = c.hidden <= 0; continue; }
      // desired speed: cruise, curves, town
      let want = Math.min(c.cruise, this.curveSpeed(c));
      if (zoneAt(c.pos.x, c.pos.z)?.id === 'town') want = Math.min(want, 12);
      // look ahead in our lane
      let block = Infinity, blockStill = false;
      const right = new THREE.Vector3(-c.fwd.z, 0, c.fwd.x);
      const check = (pos, r, still) => {
        tmp.subVectors(pos, c.pos); const along = tmp.dot(c.fwd), lat = tmp.dot(right);
        if (along > 0 && along < 45 && Math.abs(lat) < 1.0 + r) { const gap = along - 2.2 - r; if (gap < block) { block = gap; blockStill = still; } }
      };
      for (const t of T) check(t.pos, t.r, t.kind === 'parked' || (t.kind === 'car' && g.car.speed < 1) || t.kind === 'foot');
      for (const o of this.cars) if (o !== c && o.o.visible && o.dir === c.dir && o.R === c.R) check(o.pos, 1.0, o.v < 1);
      if (block < Infinity) want = Math.min(want, Math.max(0, (block - 4) * 0.7));
      // stuck behind something that isn't moving → overtake when the other lane is clear
      if (blockStill && c.v < 2) c.stuck += dt; else if (block > 40) c.stuck = 0;
      if (c.stuck > 3 && c.ot === 0) {
        const clear = !this.cars.some((o) => o !== c && o.o.visible && o.dir !== c.dir && o.pos.distanceTo(c.pos) < 70);
        if (clear) { c.ot = -2 * LANE; c.offT = 7; c.stuck = 0; }
      }
      if (c.ot !== 0) { c.offT -= dt; if (c.offT < 0) c.ot = 0; else if (Math.abs(c.off - c.ot) < 0.5) want = Math.max(want, 6); }
      c.off += (c.ot - c.off) * Math.min(1, dt * 1.5);
      // drive
      const acc = want > c.v ? 2.2 : -7;
      c.v = want > c.v ? Math.min(want, c.v + acc * dt) : Math.max(want, c.v + acc * dt);
      c.d += c.dir * c.v * dt;
      if (c.d < 2 || c.d > c.R.len - 2) { // end of the road: reappear later going the other way
        c.dir = -c.dir; c.d = clamp(c.d, 2, c.R.len - 2); c.hidden = 8 + Math.random() * 20; c.o.visible = false; c.v = 12; c.off = 0; c.ot = 0;
      }
      this.place(c);
      c.wheels.forEach((w) => { w.rotation.x += c.v * dt / 0.32; });
      if (this.hits(c, T)) return;
      const dn = c.pos.distanceTo(me);
      if (dn < nearD) { nearD = dn; nearV = c.v; nearRally = false; }
    }
    this.sound(nearD, nearV, nearRally);
  }
  hits(c, T) {
    const g = this.game;
    if (c.v <= 3 || g.dead) return false;
    for (const t of T) {
      if (t.kind === 'parked') continue;
      for (const k of [-1.5, 0, 1.5]) {
        const px = c.pos.x + c.fwd.x * k, pz = c.pos.z + c.fwd.z * k;
        if (Math.hypot(t.pos.x - px, t.pos.z - pz) < 0.95 + t.r && Math.abs(t.pos.y - c.pos.y) < 2.5) {
          g.audio.crash(20);
          c.v = 0; c.stuck = 0;
          const who = c.rally ? 'a rally car' : 'a car';
          g.die(t.kind === 'foot' ? `You were run over by ${who}.` : t.kind === 'moped' ? `You and your moped were hit by ${who}.` : `You were smashed into by ${who}.`);
          return true;
        }
      }
    }
    return false;
  }
  // rally cars: flat out, weaving across the whole road and sideways through the corners.
  // They brake (late) for cars, never for people.
  driveRally(c, dt, T) {
    let want = Math.min(c.cruise, this.curveSpeed(c));
    if (zoneAt(c.pos.x, c.pos.z)?.id === 'town') want = Math.min(want, 20);
    for (const t of T) {
      if (t.kind !== 'car' && t.kind !== 'parked') continue;
      tmp.subVectors(t.pos, c.pos); const along = tmp.dot(c.fwd);
      if (along > 0 && along < 18 && Math.abs(tmp.x * -c.fwd.z + tmp.z * c.fwd.x) < 2) want = Math.min(want, Math.max(0, (along - 5) * 1.2));
    }
    c.v = want > c.v ? Math.min(want, c.v + 5 * dt) : Math.max(want, c.v - 9 * dt);
    c.d += c.dir * c.v * dt;
    c.ph += dt;
    const half = Math.max(0.3, c.R.road.w / 2 - 1.0);
    c.off = clamp(Math.sin(c.ph * 0.9) * half * 0.6 - (c.turn || 0) * half * 1.5, -half, half); // weave and cut the corners
    c.slip += (clamp(-(c.turn || 0) * 1.1, -0.5, 0.5) * clamp(c.v / 25, 0, 1) - c.slip) * Math.min(1, dt * 3);
    if (c.d < 2 || c.d > c.R.len - 2) { // end of a road: pop up on another one
      c.R = this.routes[Math.floor(Math.random() * this.routes.length)];
      c.dir = Math.random() < 0.5 ? 1 : -1; c.d = c.dir > 0 ? 3 : c.R.len - 3;
      c.hidden = 3 + Math.random() * 8; c.o.visible = false; c.v = 15;
      return false;
    }
    this.place(c);
    c.wheels.forEach((w) => { w.rotation.x += c.v * dt / 0.32; });
    const fx = this.game.fx;
    if (fx && c.R.road.type !== 'asphalt' && c.v > 8 && Math.random() < dt * 25 && c.pos.distanceToSquared(this.game.camera.position) < 200 * 200) {
      const bx = c.pos.x - c.fwd.x * 2, bz = c.pos.z - c.fwd.z * 2;
      fx.emit(bx + (Math.random() - 0.5) * 1.4, c.pos.y + 0.3, bz + (Math.random() - 0.5) * 1.4, (Math.random() - 0.5), 0.6 + Math.random() * 0.6, (Math.random() - 0.5), 1 + Math.random(), 2.5, 0.62, 0.56, 0.46, 0.3, 1.8);
    }
    return this.hits(c, T);
  }
  // engine/tyre hum of the nearest car, so you can hear traffic coming
  sound(d, v, rally) {
    const a = this.game.audio, ctx = a.ctx; if (!ctx) return;
    if (!this.snd) {
      const out = ctx.createGain(); out.gain.value = 0; out.connect(a.master);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(out);
      const n = a.noise(true); n.connect(lp); n.start();
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60;
      const og = ctx.createGain(); og.gain.value = 0.25; osc.connect(og); og.connect(lp); osc.start();
      this.snd = { out, osc, lp };
    }
    const vol = clamp((rally ? 30 : 18) / (d + 6), 0, 1) * clamp(v / 12, 0.15, 1) * (rally ? 0.8 : 0.5);
    this.snd.out.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
    this.snd.osc.frequency.setTargetAtTime(rally ? 70 + v * 7 : 45 + v * 4, ctx.currentTime, 0.2);
    this.snd.lp.frequency.setTargetAtTime(300 + v * 30, ctx.currentTime, 0.2);
  }
  // move any car near (x,z) away (after a death, so you don't respawn into the same wreck)
  clearNear(x, z, r = 40) { for (const c of this.cars) if (c.o.visible && Math.hypot(c.pos.x - x, c.pos.z - z) < r) { c.d = (c.d + c.R.len / 2) % c.R.len; this.place(c); } }
}
