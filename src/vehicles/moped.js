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
    this.lensMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c8, emissiveIntensity: 0, roughness: 0.1 });
    cyl(o, 0.06, 0.01, this.lensMat, 0, 1.0, 0.665, 'z', 12);
    // headlight: on whenever you ride (L toggles it)
    this.light = new THREE.SpotLight(0xfff2d8, 0, 60, 0.42, 0.5, 1.2);
    this.light.position.set(0, 1.0, 0.7); this.light.target.position.set(0, -0.6, 14);
    o.add(this.light, this.light.target);
    this.lightOn = true;
    cyl(o, 0.03, 0.4, MAT.chrome, 0.12, 0.3, -0.5, 'z', 8);
    // rear parcel box (holds 2 parcels), open at the top so you can see what's in it
    const rack = new THREE.Group(); rack.position.set(0, 0.86, -0.72); o.add(rack);
    const boxM = new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.7 });
    box(rack, 0.5, 0.03, 0.66, boxM, 0, 0, 0);
    for (const sx of [-1, 1]) box(rack, 0.03, 0.26, 0.66, boxM, sx * 0.25, 0.13, 0);
    for (const sz of [-1, 1]) box(rack, 0.5, 0.26, 0.03, boxM, 0, 0.13, sz * 0.33);
    box(rack, 0.08, 0.2, 0.04, MAT.darkSteel, 0, -0.12, 0.3);
    rack.userData.containerId = 'moped';
    game.asm.containers.set('moped', rack);
    this.rack = rack;
    const hit = box(o, 0.6, 1.0, 1.5, MAT.hit, 0, 0.6, 0); hit.castShadow = false;
    o.traverse((m) => { if (m.isMesh && m.material !== MAT.hit) m.castShadow = true; });
    interact(o, {
      prompt: () => {
        const h = game.interaction.held, n = this.parcels().length;
        if (h?.def.type === 'parcel') return n < 2 ? `<span class="k">E</span>Put the parcel in the moped box (${n}/2)` : 'The moped box is full (2/2) — take a parcel out first';
        if (h) return `Moped "Pärinä 50" <span class="dim">(hands full)</span>`;
        return `<span class="k">E</span>Ride the moped "Pärinä 50"${n ? `\n<span class="k">F</span>Take a parcel out of the box (${n}/2)` : ''}`;
      },
      use: (b) => {
        const held = game.interaction.held;
        if (b === 'E') { if (held?.def.type === 'parcel') this.stow(); else this.mount(); }
        if (b === 'F' && !held) { const p = this.parcels()[0]; if (p) { game.interaction.hold(p); game.toast(`Took out the parcel for ${p.props.destName}`, 2); } }
      },
    });
    game.scene.add(o);
    this.place();
  }
  place() {
    this.pos.y = ENV.groundY(this.pos.x, this.pos.z);
    this.obj.position.copy(this.pos);
    this.obj.rotation.set(this.pitch, this.yaw, this.lean, 'YXZ');
  }
  parcels() { return [...this.game.asm.items.values()].filter((i) => i.loc?.kind === 'world' && i.loc.cont === 'moped'); }
  stow() {
    const g = this.game, inside = this.parcels();
    if (inside.length >= 2) { g.say('The moped box only fits two parcels.'); return; }
    const slots = [0.16, -0.16];
    const used = inside.map((i) => i.loc.pos[2]);
    const z = slots.find((sz) => !used.some((u) => Math.abs(u - sz) < 0.05)) ?? slots[0];
    const it = g.interaction.release();
    g.asm.placeWorld(it, [0, 0.016 - it.bounds.min.y, z], Math.PI / 2, 'moped');
    g.audio.thunk(0.4);
    g.toast(`Parcel in the moped box (${inside.length + 1}/2)`, 2);
  }
  mount() {
    const g = this.game;
    if (g.interaction.held || g.pets?.carried) { g.say('I need both hands for the handlebars.'); return; }
    this.riding = true; g.player.onMoped = true; g.player.yaw = 0; g.player.pitch = -0.1;
    g.audio.click(0.6);
    g.say('Pärinä 50. W throttle, S brake / reverse, A/D steer, L headlight, E to get off.', 3);
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
    if (!this.riding) { this.rpm = 0; this.light.intensity = 0; this.lensMat.emissiveIntensity = 0; return; }
    const g = this.game;
    if (input.hit('KeyE')) { this.dismount(); return; }
    if (input.hit('KeyL')) { this.lightOn = !this.lightOn; g.audio.click(0.4); g.toast(`Moped headlight ${this.lightOn ? 'on' : 'off'}`, 1.5); }
    this.light.intensity = this.lightOn ? 30 : 0; this.lensMat.emissiveIntensity = this.lightOn ? 2 : 0;
    const thr = input.down('KeyW') ? 1 : 0, brk = input.down('KeyS') ? 1 : 0;
    const st = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const ahead = this.pos.clone().addScaledVector(fwd, 0.6), behind = this.pos.clone().addScaledVector(fwd, -0.6);
    const slope = (ENV.groundY(ahead.x, ahead.z) - ENV.groundY(behind.x, behind.z)) / 1.2;
    const surf = ENV.surface(this.pos.x, this.pos.z);
    let a = -slope * 9.81 - this.speed * 0.05 - (1 - surf.grip) * this.speed * 0.2;
    if (thr) a += this.speed < -0.05 ? 6 : 2.6 * (1 - this.speed / 14);   // W while rolling back = brake
    if (brk) {
      if (this.speed > 0.3) a -= 6;                                       // S = brake…
      else { if (this.speed > 0) this.speed = 0; a -= 1.4 * (1 + this.speed / 3); } // …then reverse
    }
    if (!thr && !brk) a -= Math.sign(this.speed) * 0.4;
    const before = this.speed;
    this.speed += a * dt;
    if (!thr && !brk && Math.sign(before) !== Math.sign(this.speed)) this.speed = 0;
    this.speed = clamp(this.speed, -3, 15);
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
