// First-person controller: walking, sprinting, crouching, jumping, collisions,
// sitting in the car, pushing wheeled equipment.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { collidePlayer, floorAt } from '../world/colliders.js';

const EYE = 1.65, EYE_CROUCH = 0.95, EYE_PRONE = 0.28, RADIUS = 0.28;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(1.8, 0, 3.2); // feet
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI * 0.85; this.pitch = -0.15;
    this.eye = EYE;
    this.crouch = false;
    this.onGround = true;
    this.inCar = false;
    this.pushing = null;
    this.carryMass = 0;
    this.stepT = 0;
    this.lookLocked = false; // when inspecting a part the mouse rotates the part
    this.headBob = 0;
  }

  look(input, sens) {
    if (this.lookLocked) return;
    this.yaw -= input.mouse.dx * 0.0022 * sens;
    this.pitch -= input.mouse.dy * 0.0022 * sens;
    const lim = this.inCar || this.onMoped ? 1.2 : 1.5;
    this.pitch = clamp(this.pitch, -lim, lim);
    if (this.inCar || this.onMoped) this.yaw = clamp(this.yaw, -2.2, 2.2);
  }

  update(dt, input, game) {
    const sens = game.settings.sens;
    this.look(input, sens);
    if (this.inCar) return this.updateSeated(game);
    if (this.onMoped) return;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let mx = 0, mz = 0;
    if (input.down('KeyW')) mz += 1; if (input.down('KeyS')) mz -= 1;
    if (input.down('KeyD')) mx += 1; if (input.down('KeyA')) mx -= 1;
    if (input.hit('KeyZ')) { this.prone = !this.prone; if (this.prone) game.say('Lying on the creeper. Z to get up.', 2); }
    if (this.prone && (this.carryMass > 20)) this.prone = false;
    // crouch and sprint are toggles (holding Ctrl + W would close the browser tab)
    if (input.hit('ControlLeft') || input.hit('ControlRight') || input.hit('KeyC')) { this.crouchOn = !this.crouchOn; if (this.crouchOn) this.sprintOn = false; }
    if (input.hit('ShiftLeft') || input.hit('ShiftRight')) { this.sprintOn = !this.sprintOn; this.stillT = 0; if (this.sprintOn) this.crouchOn = false; }
    this.crouch = this.prone || this.crouchOn;
    const heavy = this.carryMass > 20;
    const tired = game.life.fatigue > 85;
    this.stillT = mx || mz ? 0 : (this.stillT || 0) + dt;
    if (this.stillT > 0.5) this.sprintOn = false; // sprint switches off once you've stopped
    let speed = this.prone ? 0.8 : this.crouch ? 1.3 : this.sprintOn && !heavy && !tired && game.life.canSprint() ? 5.2 : 2.7;
    if (heavy) speed *= 0.6;
    if (this.pushing) speed = Math.min(speed, 1.6);
    const wish = new THREE.Vector3().addScaledVector(fwd, mz).addScaledVector(right, mx);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const acc = this.onGround ? 14 : 3;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, acc * dt);
    if (input.hit('Space') && this.crouchOn && !this.prone) this.crouchOn = false; // Space stands you up
    else if (input.hit('Space') && this.onGround && !heavy && !this.crouch) { this.vel.y = 4.4; this.onGround = false; game.life.exert(1.5); }
    this.vel.y -= 13 * dt;
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    const eyeT = this.prone ? EYE_PRONE : this.crouch ? EYE_CROUCH : EYE;
    this.eye += (eyeT - this.eye) * Math.min(1, dt * 10);
    collidePlayer(this.pos, RADIUS, this.pos.y, this.pos.y + this.eye + 0.1, this.prone && game.car.raisedForCreeper() ? [] : game.dynamicBoxes());
    const fy = floorAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= fy) { this.pos.y = fy; this.vel.y = 0; this.onGround = true; }
    else if (this.pos.y - fy > 0.05) this.onGround = false;
    if (this.onGround && this.pos.y - fy < 0.3 && this.vel.y <= 0) this.pos.y = fy;
    // world bounds
    this.pos.x = clamp(this.pos.x, -780, 780); this.pos.z = clamp(this.pos.z, -780, 780);
    // footsteps
    const moved = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z);
    if (this.onGround && moved > 0.0005) {
      this.stepT += moved;
      this.headBob += moved * 2.4;
      if (this.stepT > (speed > 4 ? 0.85 : 0.65)) { this.stepT = 0; game.audio.footstep(game.surfaceUnderPlayer(), speed > 4 ? 1 : this.crouch ? 0.4 : 0.7); }
    }
    // pushing equipment (jack / hoist) in front of us
    if (this.pushing) {
      const o = this.pushing.obj;
      if (this.pushing.dist === undefined) this.pushing.dist = clamp(Math.hypot(o.position.x - this.pos.x, o.position.z - this.pos.z), 0.7, 1.6);
      const target = this.pos.clone().addScaledVector(fwd, this.pushing.dist);
      o.position.x += (target.x - o.position.x) * Math.min(1, dt * 8);
      o.position.z += (target.z - o.position.z) * Math.min(1, dt * 8);
      o.position.y = floorAt(o.position.x, o.position.z, 0.5);
      const wantYaw = this.yaw + (this.pushing === game.hoist ? Math.PI : Math.PI);
      let d = wantYaw - o.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      o.rotation.y += d * Math.min(1, dt * 6);
    }
    const bob = Math.sin(this.headBob * Math.PI) * 0.025 * (this.onGround ? 1 : 0);
    this.camera.position.set(this.pos.x, this.pos.y + this.eye + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  updateSeated(game) {
    const car = game.car;
    const seat = car.seatWorld(new THREE.Vector3());
    this.camera.position.copy(seat);
    const q = car.chassis.obj.quaternion.clone();
    const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw + Math.PI, 0, 'YXZ'));
    this.camera.quaternion.copy(q).multiply(local);
    this.pos.copy(seat); this.pos.y -= 1.1;
  }

  enterCar() { this.inCar = true; this.yaw = 0; this.pitch = -0.12; this.vel.set(0, 0, 0); }
  exitCar(car) {
    this.inCar = false;
    const p = car.chassis.obj.localToWorld(new THREE.Vector3(1.45, 0, -0.1));
    this.pos.set(p.x, floorAt(p.x, p.z, p.y + 1), p.z);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.chassis.obj.quaternion);
    this.yaw = Math.atan2(-fwd.x, -fwd.z);
    this.pitch = -0.1;
  }

  lookDir(out = new THREE.Vector3()) { return this.camera.getWorldDirection(out); }
  // under the car? (for jack safety)
  underCar(car) {
    if (this.inCar) return false;
    const lp = car.chassis.obj.worldToLocal(this.camera.position.clone());
    return Math.abs(lp.x) < 1.2 && Math.abs(lp.z) < 2.3 && lp.y < 1.1;
  }
}
