// Simple arcade work vehicles (the farm tractor, the logging truck): get in with E, W/S/A/D to drive,
// E to get out. Same feel as the moped, but four wheels, heavier and slower to steer.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { cyl } from '../mechanics/partMeshes.js';
import { ENV } from '../world/colliders.js';
import { clamp } from '../core/util.js';
import { interact } from '../world/buildings.js';

const K = (k) => `<span class="k">${k}</span>`;

export class WorkVehicle {
  // o: { name, pos, yaw, maxSpeed, accel, turn, len, wid, eye:[x,y,z], wheels:[[x,z,r]...], build(group), hint, canDrive?() , actionPrompt?() }
  constructor(game, o) {
    this.game = game; this.o = o;
    this.name = o.name;
    this.home = { pos: o.pos.clone(), yaw: o.yaw };
    this.pos = o.pos.clone(); this.yaw = o.yaw;
    this.speed = 0; this.pitch = 0; this.roll = 0; this.rpm = 0; this.limit = o.maxSpeed;
    this.driving = false; this.hitCool = 0;
    this.obj = new THREE.Group(); game.scene.add(this.obj);
    this.body = new THREE.Group(); this.obj.add(this.body);
    o.build(this.body, this);
    this.wheels = o.wheels.map(([x, z, r, w = 0.3]) => { const wg = new THREE.Group(); wg.position.set(x, r, z); this.body.add(wg); cyl(wg, r, w, MAT.tire, 0, 0, 0, 'x', 18); cyl(wg, r * 0.55, w + 0.02, MAT.yellowPaint, 0, 0, 0, 'x', 12); wg.userData.r = r; return wg; });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(o.wid, 2.2, o.len), MAT.hit); hit.position.y = 1.1; hit.castShadow = false; this.obj.add(hit);
    this.obj.traverse((m) => { if (m.isMesh && m.material !== MAT.hit) { m.castShadow = true; m.receiveShadow = true; } });
    interact(this.obj, {
      prompt: () => {
        if (this.driving) return '';
        const extra = o.actionPrompt?.() || '';
        if (game.interaction.held) return `${this.name} <span class="dim">(hands full)</span>${extra}`;
        return `${K('E')}Drive the ${this.name}${extra}`;
      },
      use: (b) => { if (b === 'E') this.enter(); else o.onUse?.(b); },
    });
    this.place();
  }
  ground(x, z) { return ENV.groundY(x, z); }
  place() {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const hl = this.o.len * 0.4, hw = this.o.wid * 0.4, p = this.pos;
    const yF = this.ground(p.x + fwd.x * hl, p.z + fwd.z * hl), yB = this.ground(p.x - fwd.x * hl, p.z - fwd.z * hl);
    const yR = this.ground(p.x + right.x * hw, p.z + right.z * hw), yL = this.ground(p.x - right.x * hw, p.z - right.z * hw);
    this.pitch = -Math.atan2(yF - yB, hl * 2); this.roll = Math.atan2(yR - yL, hw * 2);
    p.y = (yF + yB + yR + yL) / 4;
    this.obj.position.copy(p);
    this.obj.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }
  enter() {
    const g = this.game;
    if (g.interaction.held || g.pets?.carried) { g.say('I need both hands free to drive.'); return; }
    if (this.o.canDrive && !this.o.canDrive()) return;
    if (g.moped.riding || g.player.inCar) return;
    this.driving = true; g.player.onMoped = true; g.player.yaw = 0; g.player.pitch = -0.08;
    g.activeWorkVehicle = this;
    g.audio.thunk(0.6);
    g.say(`${this.name}: W/S drive, A/D steer, E to get out.${this.o.hint ? ' ' + this.o.hint : ''}`, 4);
  }
  exit(force = false) {
    const g = this.game;
    if (!force && Math.abs(this.speed) > 2) { g.say('Stop first!'); return; }
    this.driving = false; g.player.onMoped = false; this.speed = 0;
    if (g.activeWorkVehicle === this) g.activeWorkVehicle = null;
    const left = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(this.o.wid / 2 + 0.7);
    const x = this.pos.x + left.x, z = this.pos.z + left.z;
    g.player.pos.set(x, ENV.groundY(x, z), z); g.player.yaw = this.yaw + Math.PI; g.player.pitch = 0;
    this.place();
  }
  reset() { if (this.driving) this.exit(true); this.pos.copy(this.home.pos); this.yaw = this.home.yaw; this.speed = 0; this.place(); }
  update(dt, input) {
    this.hitCool = Math.max(0, this.hitCool - dt);
    if (!this.driving) { this.rpm = 0; return; }
    const g = this.game, o = this.o;
    if (input.hit('KeyE')) { this.exit(); return; }
    o.onDriveKey?.(input);
    const thr = input.down('KeyW') ? 1 : 0, brk = input.down('KeyS') ? 1 : 0;
    const st = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const surf = ENV.surface(this.pos.x, this.pos.z);
    let a = Math.sin(this.pitch) * 9.81 * 0.8 - this.speed * 0.04 - (1 - surf.grip) * this.speed * 0.1;
    const max = this.limit;
    if (thr) a += this.speed < -0.05 ? 7 : o.accel * (1 - clamp(this.speed / max, 0, 1));
    if (brk) { if (this.speed > 0.3) a -= 7; else { if (this.speed > 0) this.speed = 0; a -= 1.6 * (1 + this.speed / 3); } }
    if (!thr && !brk) a -= Math.sign(this.speed) * 0.8;
    const before = this.speed;
    this.speed += a * dt;
    if (!thr && !brk && Math.sign(before) !== Math.sign(this.speed)) this.speed = 0;
    this.speed = clamp(this.speed, -3.5, max);
    this.yaw += st * dt * clamp(Math.abs(this.speed) / 3, 0, 1) * o.turn * Math.sign(this.speed || 1);
    const next = this.pos.clone().addScaledVector(fwd, this.speed * dt);
    // bump into walls / trees with the nose, the tail and the middle
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let crashed = 0;
    for (const [f, s] of [[0.5, 0], [0.5, 0.45], [0.5, -0.45], [0, 0], [-0.5, 0]]) {
      const pt = next.clone().addScaledVector(fwd, f * o.len).addScaledVector(right, s * o.wid);
      const hit = ENV.pushOut(new THREE.Vector3(pt.x, ENV.groundY(pt.x, pt.z) + 0.6, pt.z));
      if (hit) { next.add(hit.push); crashed = Math.max(crashed, Math.abs(this.speed)); }
    }
    if (crashed) {
      if (crashed > 3.5 && this.hitCool <= 0) { g.audio.crash(crashed * 2); this.hitCool = 0.6; o.onCrash?.(crashed); }
      this.speed *= -0.15;
    }
    this.pos.copy(next);
    this.place();
    for (const w of this.wheels) w.rotation.x += this.speed * dt / w.userData.r;
    for (const w of this.wheels) if (w.position.z > 0) w.rotation.y = st * 0.35;
    this.rpm = 900 + Math.abs(this.speed) / max * 1800 + thr * 500;
    // camera in the cab
    const cam = g.camera;
    cam.position.copy(this.obj.localToWorld(new THREE.Vector3(...o.eye)));
    cam.quaternion.copy(this.obj.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(g.player.pitch, g.player.yaw + Math.PI, 0, 'YXZ'))));
    g.player.pos.set(this.pos.x, this.pos.y, this.pos.z);
  }
  serialize() { return { p: this.pos.toArray(), y: this.yaw }; }
  restore(d) { if (!d?.p) return; this.pos.fromArray(d.p); this.yaw = d.y; this.place(); }
}
