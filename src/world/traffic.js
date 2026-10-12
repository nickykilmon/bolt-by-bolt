// Road traffic on Route 54: cars drive in the right-hand lane, slow for curves and town,
// brake for things in their lane, overtake parked obstacles, and kill you if they hit you.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { ROADS, groundY, zoneAt } from './terrain.js';
import { clamp } from '../core/util.js';

const COLORS = [0xb02020, 0x2050a0, 0xd8d8d0, 0x303438, 0x2a6a3a, 0xc8a030, 0x6a2a6a, 0x8a8f96];
const LANE = 1.8;
const tmp = new THREE.Vector3();

function carModel(color, lamps, tails) {
  const o = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.1, metalness: 0.6 });
  box(o, 1.7, 0.55, 4.3, paint, 0, 0.6, 0);
  box(o, 1.5, 0.48, 2.1, paint, 0, 1.11, -0.25);
  box(o, 1.52, 0.4, 2.0, glass, 0, 1.12, -0.25);
  box(o, 1.74, 0.2, 0.15, MAT.darkSteel, 0, 0.42, 2.15);
  box(o, 1.74, 0.2, 0.15, MAT.darkSteel, 0, 0.42, -2.15);
  for (const sx of [-0.6, 0.6]) { box(o, 0.32, 0.16, 0.04, lamps, sx, 0.68, 2.16); box(o, 0.3, 0.14, 0.04, tails, sx, 0.7, -2.16); }
  const wheels = [];
  for (const [x, z] of [[-0.8, 1.35], [0.8, 1.35], [-0.8, -1.35], [0.8, -1.35]]) {
    const w = new THREE.Group(); w.position.set(x, 0.32, z); o.add(w);
    cyl(w, 0.32, 0.2, MAT.tire, 0, 0, 0, 'x', 14); cyl(w, 0.18, 0.21, MAT.chrome, 0, 0, 0, 'x', 8);
    wheels.push(w);
  }
  o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { o, wheels };
}

export class Traffic {
  constructor(game) {
    this.game = game;
    this.road = ROADS.find((r) => r.name === 'Route 54');
    const s = this.road.samples;
    // cumulative distance along the road
    this.dist = [0];
    for (let i = 1; i < s.length; i++) this.dist.push(this.dist[i - 1] + Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z));
    this.len = this.dist[this.dist.length - 1];
    this.lamps = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff2c0, emissiveIntensity: 0, roughness: 0.2 });
    this.tails = new THREE.MeshStandardMaterial({ color: 0x801010, emissive: 0xff1010, emissiveIntensity: 0, roughness: 0.3 });
    this.cars = [];
    const n = 9;
    for (let k = 0; k < n; k++) {
      const { o, wheels } = carModel(COLORS[k % COLORS.length], this.lamps, this.tails);
      game.scene.add(o);
      const dir = k % 2 ? 1 : -1;
      const c = { o, wheels, dir, d: (k + 0.5) / n * this.len, v: 15, ot: 0, cruise: 16 + (k * 7 % 5) * 1.3, off: 0, offT: 0, stuck: 0, hidden: 0, pos: new THREE.Vector3(), fwd: new THREE.Vector3(), yaw: 0 };
      this.cars.push(c);
      this.place(c);
    }
  }
  // position and heading on the road at distance d (along sample order)
  at(d, out) {
    const s = this.road.samples, D = this.dist;
    d = clamp(d, 0, this.len - 0.01);
    let lo = 0, hi = D.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m; else hi = m; }
    const a = s[lo], b = s[hi], t = (d - D[lo]) / Math.max(1e-6, D[hi] - D[lo]);
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
    out.dx = b.x - a.x; out.dz = b.z - a.z;
    const l = Math.hypot(out.dx, out.dz) || 1; out.dx /= l; out.dz /= l;
    return out;
  }
  place(c) {
    const p = this.at(c.d, {});
    const fx = p.dx * c.dir, fz = p.dz * c.dir;
    const lat = LANE + c.off; // right-hand traffic; negative offset = overtaking lane
    const x = p.x - fz * lat, z = p.z + fx * lat;
    c.fwd.set(fx, 0, fz);
    c.yaw = Math.atan2(fx, fz);
    const yF = groundY(x + fx * 1.4, z + fz * 1.4), yR = groundY(x - fx * 1.4, z - fz * 1.4);
    c.pos.set(x, (yF + yR) / 2, z);
    c.o.position.copy(c.pos);
    c.o.rotation.set(0, c.yaw, 0, 'YXZ');
    c.o.rotateX(-Math.atan2(yF - yR, 2.8));
  }
  // curvature ahead → safe speed
  curveSpeed(c) {
    const a = this.at(c.d, {}), b = this.at(c.d + c.dir * 30, {});
    const turn = Math.abs(Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz));
    return clamp(22 - turn * 30, 8, 22);
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
    const T = this.targets(), me = g.camera.position;
    let nearD = Infinity, nearV = 0;
    for (const c of this.cars) {
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
      for (const o of this.cars) if (o !== c && o.hidden <= 0 && o.dir === c.dir) check(o.pos, 1.0, o.v < 1);
      if (block < Infinity) want = Math.min(want, Math.max(0, (block - 4) * 0.7));
      // stuck behind something that isn't moving → overtake when the other lane is clear
      if (blockStill && c.v < 2) c.stuck += dt; else if (block > 40) c.stuck = 0;
      if (c.stuck > 3 && c.ot === 0) {
        const clear = !this.cars.some((o) => o !== c && o.hidden <= 0 && o.dir !== c.dir && o.pos.distanceTo(c.pos) < 70);
        if (clear) { c.ot = -2 * LANE; c.offT = 7; c.stuck = 0; }
      }
      if (c.ot !== 0) { c.offT -= dt; if (c.offT < 0) c.ot = 0; else if (Math.abs(c.off - c.ot) < 0.5) want = Math.max(want, 6); }
      c.off += (c.ot - c.off) * Math.min(1, dt * 1.5);
      // drive
      const acc = want > c.v ? 2.2 : -7;
      c.v = want > c.v ? Math.min(want, c.v + acc * dt) : Math.max(want, c.v + acc * dt);
      c.d += c.dir * c.v * dt;
      if (c.d < 2 || c.d > this.len - 2) { // end of the road: reappear later going the other way
        c.dir = -c.dir; c.d = clamp(c.d, 2, this.len - 2); c.hidden = 8 + Math.random() * 20; c.o.visible = false; c.v = 12; c.off = 0; c.ot = 0;
      }
      this.place(c);
      c.wheels.forEach((w) => { w.rotation.x += c.v * dt / 0.32; });
      // hits
      if (c.v > 3 && !g.dead) for (const t of T) {
        if (t.kind === 'parked') continue;
        for (const k of [-1.5, 0, 1.5]) {
          const px = c.pos.x + c.fwd.x * k, pz = c.pos.z + c.fwd.z * k;
          if (Math.hypot(t.pos.x - px, t.pos.z - pz) < 0.95 + t.r && Math.abs(t.pos.y - c.pos.y) < 2.5) {
            g.audio.crash(20);
            c.v = 0; c.stuck = 0;
            g.die(t.kind === 'foot' ? 'You were run over by a car.' : t.kind === 'moped' ? 'A car hit you and your moped.' : 'A car smashed into you.');
            return;
          }
        }
      }
      const dn = c.pos.distanceTo(me);
      if (dn < nearD) { nearD = dn; nearV = c.v; }
    }
    this.sound(nearD, nearV);
  }
  // engine/tyre hum of the nearest car, so you can hear traffic coming
  sound(d, v) {
    const a = this.game.audio, ctx = a.ctx; if (!ctx) return;
    if (!this.snd) {
      const out = ctx.createGain(); out.gain.value = 0; out.connect(a.master);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(out);
      const n = a.noise(true); n.connect(lp); n.start();
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60;
      const og = ctx.createGain(); og.gain.value = 0.25; osc.connect(og); og.connect(lp); osc.start();
      this.snd = { out, osc, lp };
    }
    const vol = clamp(18 / (d + 6), 0, 1) * clamp(v / 12, 0.15, 1) * 0.5;
    this.snd.out.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
    this.snd.osc.frequency.setTargetAtTime(45 + v * 4, ctx.currentTime, 0.2);
    this.snd.lp.frequency.setTargetAtTime(300 + v * 30, ctx.currentTime, 0.2);
  }
  // move any car near (x,z) away (after a death, so you don't respawn into the same wreck)
  clearNear(x, z, r = 40) { for (const c of this.cars) if (Math.hypot(c.pos.x - x, c.pos.z - z) < r) { c.d = (c.d + this.len / 2) % this.len; this.place(c); } }
}
