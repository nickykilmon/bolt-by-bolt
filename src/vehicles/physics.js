// Raycast-wheel rigid-body vehicle. Custom (no external physics engine) for stability
// in the browser: sub-stepped semi-implicit integration, slip-based tyre model with
// stability clamps, spring/damper suspension, body-vs-world contact impulses.
import * as THREE from 'three';
import { clamp } from '../core/util.js';

const G = 9.81;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _m3 = new THREE.Matrix3(), _m3t = new THREE.Matrix3(), _mI = new THREE.Matrix3();
const UPL = new THREE.Vector3(0, 1, 0);

const pacLong = (s) => Math.sin(1.65 * Math.atan(9 * s));
const pacLat = (a) => Math.sin(1.45 * Math.atan(9 * a));

export class VehicleBody {
  constructor() {
    this.mass = 1000;
    this.com = new THREE.Vector3(0, 0.45, 0.1);       // car-local centre of mass
    this.x = new THREE.Vector3();                     // world COM
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
    this.inertia = new THREE.Vector3(1, 1, 1);
    this.wheels = [];
    this.sleeping = true;
    this.impacts = [];                                // {local, speed} collected per step for damage
    this.scrape = 0;
  }

  addWheel(key, x, z, opts) {
    this.wheels.push({
      key, anchor: new THREE.Vector3(x, 0.56, z), radius: 0.3, maxLen: 0.3,
      k: 32000, c: 2600, steer: 0, omega: 0, inertia: 1.2, driven: false, present: true,
      comp: 0, prevComp: 0, contact: false, load: 0, slipV: 0, slipA: 0, spin: 0, susLen: 0.24,
      surface: null, driveT: 0, brakeT: 0, toe: 0, camberGrip: 1, mu: 1, ...opts,
      contactPoint: new THREE.Vector3(),
    });
  }

  setMass(m, comY) {
    this.mass = m;
    this.com.y = comY;
    const w = 1.66, h = 1.2, l = 4.1;
    this.inertia.set(m * (h * h + l * l) / 12 * 0.8, m * (w * w + l * l) / 12 * 0.85, m * (w * w + h * h) / 12 * 0.8);
  }

  // Place the body so the car origin is at pos with yaw / pitch.
  setPose(pos, quat) {
    this.q.copy(quat);
    this.x.copy(this.com).applyQuaternion(this.q).add(pos);
  }
  origin(out) { return out.copy(this.com).applyQuaternion(this.q).negate().add(this.x); }

  invInertiaWorld(out) {
    _m3.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.q));
    _m3t.copy(_m3).transpose();
    _mI.set(1 / this.inertia.x, 0, 0, 0, 1 / this.inertia.y, 0, 0, 0, 1 / this.inertia.z);
    return out.multiplyMatrices(_m3, _mI).multiply(_m3t);
  }

  applyImpulse(point, imp, Iinv) {
    this.v.addScaledVector(imp, 1 / this.mass);
    _v4.subVectors(point, this.x).cross(imp).applyMatrix3(Iinv);
    this.w.add(_v4);
  }

  pointVel(point, out) { return out.subVectors(point, this.x).crossVectors(this.w, out).add(this.v); }

  // One sub-step. hooks: { drivetrain(h, wheels), env }
  step(h, env, hooks) {
    const m = this.mass;
    const F = _v1.set(0, -G * m, 0);
    const T = new THREE.Vector3();
    const Iinv = this.invInertiaWorld(new THREE.Matrix3());
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.q);
    const upB = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q);

    hooks.drivetrain?.(h, this.wheels);

    for (const wh of this.wheels) {
      const r = wh.present ? wh.radius : 0.13;
      const a = _v2.copy(wh.anchor).sub(this.com).applyQuaternion(this.q).add(this.x);
      wh.contact = false;
      if (down.y > -0.25) { wh.susLen = wh.maxLen; this.spinFree(wh, h); continue; }
      // ray vs heightfield (few Newton iterations)
      let t = (a.y - env.groundY(a.x, a.z)) / -down.y;
      for (let it = 0; it < 3; it++) {
        const px = a.x + down.x * t, pz = a.z + down.z * t, py = a.y + down.y * t;
        t += (py - env.groundY(px, pz)) / -down.y;
      }
      let sus = t - r;
      if (sus > wh.maxLen || t < 0) { wh.susLen = wh.maxLen; wh.comp = 0; wh.prevComp = 0; this.spinFree(wh, h); continue; }
      wh.contact = true;
      const cp = wh.contactPoint.copy(down).multiplyScalar(t).add(a);
      wh.susLen = Math.max(sus, 0);
      const comp = wh.maxLen - wh.susLen;
      const compV = (comp - wh.prevComp) / h;
      wh.prevComp = comp; wh.comp = comp;
      let Fs = wh.k * comp + wh.c * compV * (compV > 0 ? 0.7 : 1.0);
      if (sus < 0.03) Fs += 120000 * (0.03 - sus) + 4000 * Math.max(0, compV); // bump stop
      Fs = Math.max(0, Fs);
      wh.load = Fs;
      const n = env.normal(cp.x, cp.z, _v3);
      const surf = env.surface(cp.x, cp.z);
      wh.surface = surf;
      // tyre frame
      const st = wh.steer + wh.toe;
      const fwd = new THREE.Vector3(Math.sin(st), 0, Math.cos(st)).applyQuaternion(this.q);
      fwd.addScaledVector(n, -fwd.dot(n)).normalize();
      const side = new THREE.Vector3().crossVectors(n, fwd);
      const vc = this.pointVel(cp, new THREE.Vector3());
      const vx = vc.dot(fwd), vy = vc.dot(side);
      const N = Fs;
      const mu = (wh.present ? surf.grip * wh.mu : 0.25);
      const mN = mu * N;
      const mEff = m / 4;
      // longitudinal
      let Fx = 0, Fy = 0;
      if (wh.present) {
        const slipV = wh.omega * r - vx;
        wh.slipV = slipV;
        Fx = mN * pacLong(slipV / Math.max(Math.abs(vx), 3));
        const maxFx = Math.abs(slipV) / (h * (r * r / wh.inertia + 1 / mEff));
        Fx = clamp(Fx, -maxFx, maxFx);
        Fx -= Math.sign(vx) * Math.min(Math.abs(vx) * 200, N * (0.012 + surf.roll));
      } else {
        Fx = -clamp(vx * mEff / h, -mN, mN); // dragging hub
        wh.slipV = 0;
      }
      const alpha = Math.atan2(vy, Math.max(Math.abs(vx), 1.5));
      wh.slipA = alpha;
      Fy = -mN * pacLat(alpha) * wh.camberGrip;
      const maxFy = Math.abs(vy) * mEff / h;
      Fy = clamp(Fy, -maxFy, maxFy);
      // friction circle
      const tot = Math.hypot(Fx, Fy);
      if (tot > mN && tot > 0) { Fx *= mN / tot; Fy *= mN / tot; }
      // wheel spin
      if (wh.present) {
        wh.omega += (wh.driveT - Fx * r) / wh.inertia * h;
        this.brake(wh, h);
      }
      const force = new THREE.Vector3().addScaledVector(upB, Fs).addScaledVector(fwd, Fx).addScaledVector(side, Fy);
      F.add(force);
      T.add(new THREE.Vector3().subVectors(cp, this.x).cross(force));
      wh.spin += wh.omega * h;
    }

    // aero drag + downforce-free lift
    const sp = this.v.length();
    F.addScaledVector(this.v, -0.42 * sp);
    // integrate
    this.v.addScaledVector(F, h / m);
    this.w.add(T.applyMatrix3(Iinv).multiplyScalar(h));
    this.w.multiplyScalar(1 - 0.02 * h); // tiny angular damping
    this.x.addScaledVector(this.v, h);
    const wq = new THREE.Quaternion(this.w.x * h * 0.5, this.w.y * h * 0.5, this.w.z * h * 0.5, 0).multiply(this.q);
    this.q.x += wq.x; this.q.y += wq.y; this.q.z += wq.z; this.q.w += wq.w; this.q.normalize();

    this.collide(env, h);
  }

  spinFree(wh, h) {
    wh.load = 0; wh.slipV = 0;
    if (!wh.present) return;
    wh.omega += wh.driveT / wh.inertia * h;
    this.brake(wh, h);
    wh.omega *= 1 - 0.3 * h;
    wh.spin += wh.omega * h;
  }
  brake(wh, h) {
    const dw = wh.brakeT / wh.inertia * h;
    if (Math.abs(wh.omega) <= dw) wh.omega = 0; else wh.omega -= Math.sign(wh.omega) * dw;
  }

  collide(env, h) {
    const Iinv = this.invInertiaWorld(new THREE.Matrix3());
    const origin = this.origin(new THREE.Vector3());
    const pts = COLLIDE_PTS;
    this.scrape = 0;
    for (const lp of pts) {
      const p = _v2.copy(lp).applyQuaternion(this.q).add(origin);
      // ground
      const gy = env.groundY(p.x, p.z);
      if (p.y < gy) {
        const n = env.normal(p.x, p.z, new THREE.Vector3());
        const depth = gy - p.y;
        this.x.addScaledVector(n, depth * 0.6);
        origin.addScaledVector(n, depth * 0.6);
        this.contactImpulse(p, n, Iinv, 0.1, 0.5, lp);
        this.scrape = Math.max(this.scrape, this.v.length());
      }
      // static boxes & trees
      const hit = env.pushOut(p, 0.0);
      if (hit) {
        this.x.add(hit.push); origin.add(hit.push);
        this.contactImpulse(p, hit.n, Iinv, 0.25, 0.4, lp);
      }
    }
  }

  contactImpulse(p, n, Iinv, e, fr, local) {
    const r = new THREE.Vector3().subVectors(p, this.x);
    const vrel = this.pointVel(p, new THREE.Vector3());
    const vn = vrel.dot(n);
    if (vn >= 0) return;
    const rn = new THREE.Vector3().crossVectors(r, n).applyMatrix3(Iinv).cross(r);
    const j = -(1 + e) * vn / (1 / this.mass + n.dot(rn));
    this.applyImpulse(p, n.clone().multiplyScalar(j), Iinv);
    // friction
    const vt = vrel.addScaledVector(n, -vn);
    const vtl = vt.length();
    if (vtl > 1e-4) {
      const jt = Math.min(fr * j, vtl * this.mass * 0.5);
      this.applyImpulse(p, vt.multiplyScalar(-jt / vtl), Iinv);
    }
    if (-vn > 2.5) this.impacts.push({ local: local.clone(), speed: -vn });
  }
}

// Body collision probe points (car-local)
const COLLIDE_PTS = [];
for (const x of [-0.82, 0.82]) for (const z of [-2.08, -1.2, 0, 1.2, 2.06]) COLLIDE_PTS.push(new THREE.Vector3(x, 0.32, z));
for (const x of [-0.7, 0.7]) for (const z of [-0.9, 0.15]) COLLIDE_PTS.push(new THREE.Vector3(x, 1.36, z));
for (const z of [-2.1, 2.08]) COLLIDE_PTS.push(new THREE.Vector3(0, 0.42, z));
for (const x of [-0.82, 0.82]) for (const z of [-2.0, 1.95]) COLLIDE_PTS.push(new THREE.Vector3(x, 0.95, z));
COLLIDE_PTS.push(new THREE.Vector3(0, 0.15, 0.4), new THREE.Vector3(0, 0.2, -1.2), new THREE.Vector3(0, 0.22, 1.5));
