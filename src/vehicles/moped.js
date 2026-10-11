// JC's old moped "Pärinä 50": simple arcade ride for getting around before the car runs.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { ENV } from '../world/colliders.js';
import { clamp } from '../core/util.js';
import { interact } from '../world/buildings.js';

export class Moped {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(4.2, 0, 9.5);
    this.yaw = 0.2;
    this.speed = 0; this.lean = 0; this.pitch = 0; this.rpm = 0;
    this.riding = false;
    this.obj = new THREE.Group();
    const o = this.obj, paint = new THREE.MeshStandardMaterial({ color: 0x2a7a5a, roughness: 0.5, metalness: 0.3 });
    this.wheels = [];
    for (const z of [0.6, -0.55]) { const w = new THREE.Group(); w.position.set(0, 0.25, z); o.add(w); cyl(w, 0.25, 0.08, MAT.tire, 0, 0, 0, 'x', 18); cyl(w, 0.12, 0.09, MAT.chrome, 0, 0, 0, 'x', 10); this.wheels.push(w); }
    box(o, 0.12, 0.12, 1.1, paint, 0, 0.5, 0.0, -0.15);
    box(o, 0.32, 0.28, 0.5, paint, 0, 0.55, -0.3);
    box(o, 0.28, 0.1, 0.55, MAT.seat, 0, 0.8, -0.3);
    box(o, 0.25, 0.22, 0.35, MAT.darkSteel, 0, 0.35, -0.05);
    cyl(o, 0.03, 0.75, MAT.chrome, 0, 0.75, 0.55, 'y', 6).rotation.x = -0.25;
    cyl(o, 0.015, 0.6, MAT.chrome, 0, 1.12, 0.48, 'x', 6);
    const lamp = cyl(o, 0.07, 0.08, MAT.chrome, 0, 1.0, 0.62, 'z', 12);
    cyl(o, 0.06, 0.01, MAT.lens, 0, 1.0, 0.665, 'z', 12);
    cyl(o, 0.03, 0.4, MAT.chrome, 0.12, 0.3, -0.5, 'z', 8);
    const hit = box(o, 0.6, 1.0, 1.5, MAT.hit, 0, 0.6, 0); hit.castShadow = false;
    o.traverse((m) => { if (m.isMesh && m.material !== MAT.hit) m.castShadow = true; });
    interact(o, { prompt: () => `<span class="k">E</span>Ride the moped "Pärinä 50"`, use: (b) => b === 'E' && this.mount() });
    game.scene.add(o);
    this.place();
  }
  place() {
    this.pos.y = ENV.groundY(this.pos.x, this.pos.z);
    this.obj.position.copy(this.pos);
    this.obj.rotation.set(this.pitch, this.yaw, this.lean, 'YXZ');
  }
  mount() {
    const g = this.game;
    if (g.interaction.held) { g.say('I need both hands for the handlebars.'); return; }
    this.riding = true; g.player.onMoped = true; g.player.yaw = 0; g.player.pitch = -0.1;
    g.audio.click(0.6);
    g.say('Pärinä 50. W/S throttle & brake, A/D steer, E to get off.', 3);
  }
  dismount() {
    const g = this.game;
    if (this.speed > 3) { g.say('Slow down first!'); return; }
    this.riding = false; g.player.onMoped = false; this.speed = 0;
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.9);
    g.player.pos.set(this.pos.x + side.x, ENV.groundY(this.pos.x + side.x, this.pos.z + side.z), this.pos.z + side.z);
    g.player.yaw = this.yaw + Math.PI;
    this.lean = 0; this.place();
  }
  update(dt, input) {
    if (!this.riding) { this.rpm = 0; return; }
    const g = this.game;
    if (input.hit('KeyE')) { this.dismount(); return; }
    const thr = input.down('KeyW') ? 1 : 0, brk = input.down('KeyS') ? 1 : 0;
    const st = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const ahead = this.pos.clone().addScaledVector(fwd, 0.6), behind = this.pos.clone().addScaledVector(fwd, -0.6);
    const slope = (ENV.groundY(ahead.x, ahead.z) - ENV.groundY(behind.x, behind.z)) / 1.2;
    const surf = ENV.surface(this.pos.x, this.pos.z);
    let a = thr * 2.6 * (1 - this.speed / 14) - brk * 6 * Math.sign(this.speed) - slope * 9.81 - this.speed * 0.05 - (1 - surf.grip) * this.speed * 0.2;
    if (!thr && !brk) a -= Math.sign(this.speed) * 0.4;
    this.speed += a * dt;
    if (brk && this.speed < 0.3 && this.speed > -0.3) this.speed = 0;
    this.speed = clamp(this.speed, -1.5, 15);
    this.yaw += st * dt * clamp(Math.abs(this.speed) / 4, 0, 1) * 1.4 * Math.sign(this.speed || 1);
    this.lean += (-st * clamp(this.speed / 10, 0, 1) * 0.35 - this.lean) * Math.min(1, dt * 5);
    const next = this.pos.clone().addScaledVector(fwd, this.speed * dt);
    for (const pt of [next.clone().addScaledVector(fwd, 0.8), next]) {
      const hit = ENV.pushOut(new THREE.Vector3(pt.x, ENV.groundY(pt.x, pt.z) + 0.5, pt.z));
      if (hit) { next.add(hit.push); if (Math.abs(this.speed) > 4) { g.audio.crash(this.speed * 2); g.life.exert(5); g.say('Ouch!'); } this.speed *= -0.2; }
    }
    this.pos.copy(next);
    this.pitch = -Math.atan(slope);
    this.place();
    this.wheels.forEach((w) => { w.rotation.x += this.speed * dt / 0.25; });
    this.rpm = 1800 + Math.abs(this.speed) * 420 + thr * 900;
    // camera
    const cam = g.camera;
    const head = this.obj.localToWorld(new THREE.Vector3(0, 1.55, -0.35));
    cam.position.copy(head);
    const q = this.obj.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(g.player.pitch, g.player.yaw + Math.PI, 0, 'YXZ')));
    cam.quaternion.copy(q);
    g.player.pos.set(this.pos.x, this.pos.y, this.pos.z);
  }
  serialize() { return { p: this.pos.toArray(), y: this.yaw }; }
  restore(d) { if (!d) return; this.pos.fromArray(d.p); this.yaw = d.y; this.place(); }
}
