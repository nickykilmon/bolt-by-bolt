// The player's car: ties together the assembly (chassis root), physics body, powertrain,
// support state (jack / axle stands), damage, leaks and the cockpit.
import * as THREE from 'three';
import { dentAt, applyDents, undent } from './damage.js';
import { VehicleBody } from './physics.js';
import { analyze, newPowertrain, stepPowertrain, slowUpdate } from './systems.js';
import { buildShell, drawGauges } from './carBody.js';
import { CORNERS, ENGINE_POS } from '../mechanics/partsdb.js';
import { ENV } from '../world/colliders.js';
import { heightAt } from '../world/terrain.js';
import { clamp } from '../core/util.js';
import { MAT } from '../core/materials.js';
import { labelTex } from '../core/textures.js';

const KEYS = ['FL', 'FR', 'RL', 'RR'];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class Car {
  constructor(asm, scene) {
    this.asm = asm;
    this.scene = scene;
    this.chassis = asm.create('chassis_ruska', { uid: 'car' });
    this.chassis.loc = { kind: 'root' };
    this.chassis.props.coolant = this.chassis.props.coolant ?? 0;
    this.shell = buildShell(this.chassis.obj);
    scene.add(this.chassis.obj);
    asm.containers.set('car', this.shell.group);
    this.body = new VehicleBody();
    for (const k of KEYS) this.body.addWheel(k, CORNERS[k].x, CORNERS[k].z, { driven: k[0] === 'R' });
    this.pt = newPowertrain();
    this.S = null; this.sVer = -1; this.sTimer = 0;
    this.park = { pos: new THREE.Vector3(-1.2, 0, 0.3), yaw: 0 };
    this.support = { F: { lift: 0, jack: false, stands: false }, R: { lift: 0, jack: false, stands: false } };
    this.mode = 'parked';
    this.driverInside = false;
    this.speed = 0;
    this.lightsOn = false;
    this.ambient = 15;
    this.puddles = [];
    this.leakAcc = { oil: 0, coolant: 0 };
    this.messages = [];
    this.sleepT = 0;
    this.gaugeT = 0;
    this.steerVis = 0;
    this.cosmetics = new THREE.Group(); this.shell.group.add(this.cosmetics);
    this.podLights = [];
    for (const sx of [-0.25, 0.25]) { const L = new THREE.SpotLight(0xffffff, 0, 140, 0.35, 0.4, 1.0); L.position.set(sx, 0.65, 2.2); L.target.position.set(sx, 0.0, 30); this.chassis.obj.add(L, L.target); this.podLights.push(L); }
    this.applyCosmetics();
    this.asm.ctx.isLifted = (host, axle) => host !== this.chassis || this.support[axle].lift > 0.05;
  }

  // ---------- paint & livery ----------
  applyCosmetics() {
    const P = this.chassis.props;
    const col = new THREE.Color(P.paint || '#c4a25a');
    MAT.carPaint.color.copy(col);
    MAT.carPaintDull.color.copy(col).multiplyScalar(0.82);
    this.cosKey = [P.paint, P.livery, P.number, P.mudflaps, P.stripe].join('|');
    const g = this.cosmetics;
    while (g.children.length) g.remove(g.children[0]);
    const stripeM = new THREE.MeshStandardMaterial({ color: P.stripe || '#ffffff', roughness: 0.5 });
    const add = (w, h, d, x, y, z, m = stripeM, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; };
    const L = P.livery || 'none';
    if (L === 'stripes' || L === 'rally') for (const sx of [-0.12, 0.12]) { add(0.14, 0.004, 1.12, sx, 1.393, -0.41); add(0.14, 0.004, 0.5, sx, 0.973, -1.95); }
    if (L === 'side' || L === 'rally') for (const sx of [-1, 1]) { add(0.004, 0.07, 1.35, sx * 0.852, 0.62, 1.33); add(0.004, 0.07, 1.55, sx * 0.852, 0.62, -1.24); }
    if (L === 'checker') {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 16, j * 16, 16, 16); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 })); m.rotation.x = -Math.PI / 2; m.position.set(0, 1.393, -0.41); g.add(m);
    }
    if (L === 'rally') {
      const sp = new THREE.MeshStandardMaterial({ map: labelTex('RUSKALA RALLI TEAM', 512, 64, '#00000000', P.stripe || '#ffffff', 'bold 44px Impact'), transparent: true });
      for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.15), sp); m.position.set(sx * 0.853, 0.8, -1.25); m.rotation.y = sx * Math.PI / 2; g.add(m); }
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.12), new THREE.MeshStandardMaterial({ map: labelTex('KAASU-KALLE', 512, 48, '#b01010', '#fff', 'bold 38px Impact') }));
      ban.rotation.set(-0.89, 0, 0); ban.position.set(0, 1.31, 0.25); g.add(ban); // windscreen banner
    }
    if (P.number) {
      const nm = new THREE.MeshStandardMaterial({ map: labelTex(String(P.number), 128, 128, '#ffffff', '#111', 'bold 90px Impact'), roughness: 0.5 });
      for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), nm); m.position.set(sx * 0.853, 0.66, 1.45); m.rotation.y = sx * Math.PI / 2; g.add(m); }
      const roof = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), nm); roof.rotation.x = -Math.PI / 2; roof.position.set(0, 1.396, -0.75); g.add(roof);
    }
    if (P.mudflaps) {
      const fm = new THREE.MeshStandardMaterial({ color: P.stripe || '#d02020', roughness: 0.8, side: THREE.DoubleSide });
      for (const [x, z] of [[0.72, 0.75], [-0.72, 0.75], [0.72, -1.65], [-0.72, -1.65]]) add(0.22, 0.3, 0.012, x, 0.2, z, fm);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // ---------- helpers ----------
  useBattery(d) { const b = this.chassis.kids.battery; if (b) b.props.charge = clamp((b.props.charge ?? 0) - d, 0, 1); }
  bendValves() {
    const h = this.chassis.kids.engine?.kids.head;
    if (h?.kids.valvesIn) h.kids.valvesIn.cond = Math.min(h.kids.valvesIn.cond, 0.08);
    if (h?.kids.valvesEx) h.kids.valvesEx.cond = Math.min(h.kids.valvesEx.cond, 0.08);
    this.asm.changed();
  }
  raisedForCreeper() { return this.mode === 'parked' && (this.support.F.lift > 0.12 || this.support.R.lift > 0.12); }
  get lifted() { return this.support.F.lift > 0.02 || this.support.R.lift > 0.02; }
  get supportedForWork() { return (this.support.F.lift < 0.05 || this.support.F.stands) && (this.support.R.lift < 0.05 || this.support.R.stands); }

  systems() {
    if (!this.S || this.sVer !== this.asm.version || this.sTimer > 0.5) {
      this.S = analyze(this.asm, this);
      this.sVer = this.asm.version; this.sTimer = 0;
      this.applyParams();
    }
    return this.S;
  }

  applyParams() {
    const S = this.S;
    let mass = 520;
    for (const d of this.asm.descendants(this.chassis)) mass += d.def.mass || 0;
    mass += 75; // driver-ish ballast so the empty car doesn't float
    const fuel = this.chassis.kids.fuelTank?.props.fuel || 0;
    mass += fuel * 0.75;
    this.mass = mass;
    this.body.setMass(mass, 0.48);
    const ch = this.chassis.kids;
    this.body.aero = { f: ch.splitter?.props.aero || 0, r: ch.trunk?.kids.spoiler?.props.aero || 0 }; // downforce coefficients
    this.body.wheels.forEach((w) => {
      const C = S.corners[w.key];
      w.present = C.wheel;
      w.k = C.k; w.c = C.damp;
      w.anchor.y = 0.56 + C.preload;
      const pressF = 1 - Math.min(Math.abs(C.pressure - 2.0) * 0.18, 0.4);
      w.mu = (0.55 + 0.45 * Math.min(1, C.tyre * 1.5)) * pressF;
      w.gripRoad = C.grip; w.gripGravel = C.gravel;
      w.toe = C.toe;
      w.loose = C.wheelLoose;
    });
  }

  // world-space position of engine (for leaks/sounds), works on stand too
  engineWorldPos(out = new THREE.Vector3()) {
    const b = this.chassis.kids.engine;
    if (b) return b.obj.getWorldPosition(out);
    return this.chassis.obj.localToWorld(out.set(...ENGINE_POS));
  }

  leaked(type, amount, where) {
    this.leakAcc[type] = (this.leakAcc[type] || 0) + amount;
    if (this.leakAcc[type] > 0.06) {
      this.leakAcc[type] = 0;
      const p = where ? where.clone() : this.engineWorldPos();
      if (!where) { p.x += (Math.random() - 0.5) * 0.3; p.z += (Math.random() - 0.5) * 0.3; }
      this.addPuddle(p, type);
    }
  }
  addPuddle(p, type) {
    const y = heightAt(p.x, p.z) + 0.004 + this.puddles.length * 0.0001;
    let near = this.puddles.find((q) => q.type === type && q.mesh.position.distanceTo(new THREE.Vector3(p.x, y, p.z)) < 0.5);
    if (near) { near.size = Math.min(near.size + 0.05, 1.2); near.mesh.scale.setScalar(near.size); return; }
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 16), type === 'oil' ? PUDDLE_OIL : PUDDLE_COOL);
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, y, p.z); m.scale.setScalar(0.15);
    this.scene.add(m);
    this.puddles.push({ mesh: m, type, size: 0.15 });
    if (this.puddles.length > 40) { const old = this.puddles.shift(); this.scene.remove(old.mesh); }
  }

  // ---------- pose ----------
  restOffsets() {
    // car-origin height above ground at each corner when resting on its wheels
    const out = {};
    for (const w of this.body.wheels) {
      const load = this.mass * 9.81 / 4;
      const comp = clamp(load / w.k, 0, w.maxLen);
      const wcl = w.anchor.y - (w.maxLen - comp);
      const r = w.present ? w.radius : 0.13;
      out[w.key] = r - wcl;
    }
    return out;
  }
  kinematicPose() {
    const off = this.restOffsets();
    const yaw = this.park.yaw;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const gy = (k) => { const C = CORNERS[k]; return heightAt(this.park.pos.x + C.x * c + C.z * s, this.park.pos.z - C.x * s + C.z * c); };
    const h = {};
    for (const k of KEYS) h[k] = gy(k) + off[k] + this.support[k[0]].lift;
    const yF = (h.FL + h.FR) / 2, yR = (h.RL + h.RR) / 2, yL = (h.FL + h.RL) / 2, yRt = (h.FR + h.RR) / 2;
    const pitch = -Math.atan2(yF - yR, 2.4), roll = Math.atan2(yL - yRt, 1.44);
    const pos = new THREE.Vector3(this.park.pos.x, (yF + yR) / 2, this.park.pos.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    return { pos, q };
  }

  wake() {
    if (this.mode === 'physics') return;
    const { pos, q } = this.kinematicPose();
    this.body.setPose(pos, q);
    this.body.v.set(0, 0, 0); this.body.w.set(0, 0, 0);
    const off = this.restOffsets();
    for (const w of this.body.wheels) { w.omega = 0; const load = this.mass * 9.81 / 4; w.prevComp = clamp(load / w.k, 0, w.maxLen); }
    this.mode = 'physics';
    this.sleepT = 0;
  }
  sleep() {
    const o = this.body.origin(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.body.q);
    this.park.pos.set(o.x, 0, o.z);
    this.park.yaw = Math.atan2(fwd.x, fwd.z);
    this.mode = 'parked';
  }
  isUpsideDown() {
    if (this.mode !== 'physics') return false;
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.body.q).y < 0.3;
  }
  flipUpright() {
    const o = this.body.origin(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.body.q);
    this.park.pos.set(o.x, 0, o.z); this.park.yaw = Math.atan2(fwd.x, fwd.z);
    this.mode = 'parked';
  }

  canDrive() {
    if (this.support.F.lift > 0.01 || this.support.R.lift > 0.01) return false;
    return true;
  }

  // ---------- per frame ----------
  update(dt, ctl, settings) {
    const S = this.systems();
    this.sTimer += dt;
    const pt = this.pt;
    pt.ign = ctl.ign;
    pt.cranking = ctl.crank && ctl.ign > 0;
    pt.gear = ctl.gear;
    const wheels = this.body.wheels;
    const steerOk = S.steerOk;
    const st = steerOk ? ctl.steer : 0;
    for (const w of wheels) w.steer = w.key[0] === 'F' ? st * 0.55 : 0;
    // wheel wobble when lug nuts are loose
    for (const w of wheels) if (w.loose > 0.3 && this.speed > 3) w.toe += Math.sin(performance.now() * 0.02) * 0.02 * w.loose;

    const wantPhysics = this.driverInside && this.canDrive();
    if (wantPhysics || (this.mode === 'physics' && this.canDrive())) this.wake();
    if (this.mode === 'physics' && !this.canDrive()) this.sleep();

    if (this.mode === 'physics') {
      const n = Math.min(10, Math.ceil(dt / (1 / 300)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        this.body.step(h, ENV, { drivetrain: (hh, ws) => stepPowertrain(pt, S, hh, ws, ctl, settings) });
      }
      this.speed = this.body.v.length();
      this.applyPose(this.body.origin(_v), this.body.q);
      // sleep when abandoned and still
      if (!this.driverInside && this.speed < 0.08 && !pt.running) { this.sleepT += dt; if (this.sleepT > 1.5) this.sleep(); }
      else this.sleepT = 0;
      this.handleImpacts();
      if (this.body.x.y < -30) { this.flipUpright(); this.park.pos.set(0, 0, 40); }
    } else {
      // parked: grounded wheels are held by the ground, lifted wheels spin freely
      const n = Math.min(6, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        stepPowertrain(pt, S, h, wheels, ctl, settings);
        for (const w of wheels) {
          if (this.support[w.key[0]].lift > 0.05 && w.present) { w.omega += w.driveT / w.inertia * h; const dw = w.brakeT / w.inertia * h; w.omega = Math.abs(w.omega) <= dw ? 0 : w.omega - Math.sign(w.omega) * dw; w.omega *= 1 - 0.5 * h; w.spin += w.omega * h; }
          else w.omega = 0;
        }
      }
      this.speed = 0;
      const { pos, q } = this.kinematicPose();
      this.applyPose(pos, q);
    }
    this.messages.push(...slowUpdate(pt, S, dt, this));
    this.updateVisuals(dt, ctl);
  }

  applyPose(pos, q) {
    this.chassis.obj.position.copy(pos);
    this.chassis.obj.quaternion.copy(q);
  }

  // crumple the panels near a hit (visual only)
  dent(local, speed) {
    const now = performance.now(); if (now - (this.lastDentT || 0) < 250) return; this.lastDentT = now;
    const ch = this.chassis.kids, o = this.chassis.obj;
    const wp = o.localToWorld(local.clone());
    const dl = new THREE.Vector3(-local.x * 0.6, -0.15, -local.z).normalize();       // towards the middle of the car
    const wd = dl.applyQuaternion(o.quaternion);
    const r = 0.25 + speed * 0.028, depth = Math.min(0.2, (speed - 3) * 0.022);
    for (const k of ['bumperF', 'bumperR', 'hood', 'trunk', 'doorL', 'doorR', 'headlightL', 'headlightR', 'taillightL', 'taillightR', 'splitter', 'skirtL', 'skirtR', 'lightPod']) {
      const inst = ch[k]; if (!inst) continue;
      inst.props.dents = inst.props.dents || [];
      dentAt(inst.obj, inst.props.dents, wp, wd, r, depth, inst);
    }
    this.chassis.props.shellDents = this.chassis.props.shellDents || [];
    dentAt(this.shell.group, this.chassis.props.shellDents, wp, wd, r * 0.9, depth * 0.8, 'shell');
  }
  reapplyShellDents() { applyDents(this.shell.group, this.chassis.props.shellDents, 'shell'); }
  repairShell() { undent(this.shell.group); this.chassis.props.shellDents = []; }
  handleImpacts() {
    const imp = this.body.impacts;
    if (!imp.length) return;
    let worst = 0;
    for (const { local, speed } of imp) {
      worst = Math.max(worst, speed);
      if (speed > 3.5) this.dent(local, speed);
      const dmg = (speed - 2.5) * 0.04;
      const ch = this.chassis.kids;
      const hit = (inst, k = 1) => { if (inst) { inst.cond = Math.max(0, inst.cond - dmg * k); } };
      if (local.z > 1.6) {
        hit(ch.bumperF, 1.2); hit(ch.headlightL, local.x > 0 ? 1.5 : 0.3); hit(ch.headlightR, local.x < 0 ? 1.5 : 0.3); hit(ch.hood, 0.6);
        if (speed > 5) hit(ch.radiator, 1);
        if (speed > 7) { const side = local.x > 0 ? 'FL' : 'FR'; const arm = ch['controlArm' + side]; if (arm) arm.props.bent = (arm.props.bent || 0) + (speed - 7) * 0.006 * (Math.random() < 0.5 ? 1 : -1); }
      } else if (local.z < -1.6) { hit(ch.bumperR, 1.2); hit(ch.taillightL, 0.8); hit(ch.taillightR, 0.8); hit(ch.trunk, 0.5); if (speed > 4) hit(ch.muffler, 0.8); }
      else { hit(local.x > 0 ? ch.doorL : ch.doorR, 0.8); }
      if (local.y < 0.3 && speed > 6) { hit(ch.engine?.kids.oilPan, 0.25); hit(ch.muffler, 0.2); }
      if (Math.abs(local.x) > 0.6 && Math.abs(Math.abs(local.z) - 1.2) < 0.5 && speed > 6) {
        const c = (local.x > 0 ? (local.z > 0 ? 'FL' : 'RL') : (local.z > 0 ? 'FR' : 'RR'));
        hit(ch['wheel' + c], 0.5); hit(ch['shock' + c], 0.7);
        const tr = ch['tieRod' + c]; if (tr) tr.props.bent = (tr.props.bent || 0) + (speed - 6) * 0.004;
      }
    }
    this.body.impacts.length = 0;
    this.lastImpact = worst;
    this.asm.changed();
  }

  updateVisuals(dt, ctl) {
    const S = this.S, pt = this.pt;
    // wheels & suspension
    const lifted = (k) => this.support[k[0]].lift > 0.05;
    for (const w of this.body.wheels) {
      const C = CORNERS[w.key];
      let wcy;
      if (this.mode === 'physics') wcy = w.anchor.y - w.susLen;
      else if (lifted(w.key)) wcy = w.anchor.y - w.maxLen;
      else { const comp = clamp(this.mass * 9.81 / 4 / w.k, 0, w.maxLen); wcy = w.anchor.y - (w.maxLen - comp); }
      const dy = wcy - 0.3;
      const ch = this.chassis.kids;
      const wheel = ch['wheel' + w.key];
      if (wheel) {
        wheel.vis.position.y = dy;
        wheel.vis.rotation.set(w.spin * C.side, w.steer * C.side, 0, 'YXZ');
        if (wheel.fastG) { wheel.fastG.position.y = dy; wheel.fastG.rotation.copy(wheel.vis.rotation); }
      }
      for (const part of ['disc', 'pads', 'caliper']) {
        const p = ch[part + w.key];
        if (p) { p.vis.position.y = dy; p.vis.rotation.set(0, w.steer * C.side, 0); if (p.fastG) { p.fastG.position.y = dy; p.fastG.rotation.y = w.steer * C.side; } }
      }
      const spring = ch['spring' + w.key];
      if (spring) spring.vis.scale.y = clamp(1 + dy * 2.2, 0.6, 1.25);
    }
    // steering wheel
    this.steerVis += ((ctl.steer || 0) - this.steerVis) * Math.min(1, dt * 10);
    const sw = this.chassis.kids.steeringWheel;
    if (sw) sw.vis.rotation.z = -this.steerVis * 2.2;
    // gear lever
    // H-pattern: 1 left-fwd, 2 left-back, 3 centre-fwd, 4 centre-back, R right-fwd
    const g = pt.gear;
    const fwdTilt = g === 0 ? 0 : (g === 1 || g === 3 || g === -1) ? 0.18 : -0.18;
    const sideTilt = g === 1 || g === 2 ? -0.2 : g === -1 ? 0.2 : 0;
    this.shell.lever.rotation.set(fwdTilt, 0, sideTilt);
    this.shell.handbrake.rotation.x = ctl.hand > 0.5 ? -0.35 : 0;
    this.shell.key.rotation.z = pt.cranking ? -1.2 : pt.ign ? -0.8 : 0;
    // lights
    const lightsOk = S.lights && this.lightsOn;
    this.shell.lights[0].intensity = lightsOk && this.chassis.kids.headlightL && this.chassis.kids.headlightL.cond > 0.15 ? 40 : 0;
    this.shell.lights[1].intensity = lightsOk && this.chassis.kids.headlightR && this.chassis.kids.headlightR.cond > 0.15 ? 40 : 0;
    MAT.lens.emissive.setHex(lightsOk ? 0xfff0c0 : 0); MAT.lens.emissiveIntensity = 2;
    const pod = this.chassis.kids.lightPod;
    for (const L of this.podLights) L.intensity = lightsOk && pod && pod.cond > 0.15 ? 70 : 0;
    MAT.redLens.emissive.setHex((lightsOk || ctl.brake > 0.1) && S.electric ? 0xff2010 : 0); MAT.redLens.emissiveIntensity = ctl.brake > 0.1 ? 2 : 0.8;
    // openables animation
    for (const k of ['hood', 'doorL', 'doorR', 'trunk']) {
      const p = this.chassis.kids[k];
      if (!p) continue;
      const target = p.props.open ? 1 : 0;
      const t0 = p.props.openT ?? target;
      if (Math.abs(t0 - target) > 0.001) { p.props.openT = t0 + Math.sign(target - t0) * Math.min(Math.abs(target - t0), dt * 2.5); this.asm.applyOpen(p); }
    }
    // gauges @ 15 Hz
    this.gaugeT += dt;
    if (this.gaugeT > 0.066) {
      this.gaugeT = 0;
      const tank = this.chassis.kids.fuelTank;
      drawGauges(this.shell.gaugeCanvas, {
        ign: pt.ign > 0 && S.electric, rpm: pt.rpm, kmh: this.speed * 3.6,
        fuel: (tank?.props.fuel || 0) / 45, temp: pt.temp,
        oilLamp: pt.oilP < 0.5, battLamp: !(pt.running && S.charging), hotLamp: pt.temp > 110, lights: this.lightsOn, hand: ctl.hand > 0.5,
        gear: pt.gear === -1 ? 'R' : pt.gear === 0 ? 'N' : String(pt.gear),
      });
      this.shell.gaugeTex.needsUpdate = true;
    }
  }
  forwardSpeed() { return this.body.v.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(this.body.q)); }

  // seat position in world (for camera)
  seatWorld(out) { return this.chassis.obj.localToWorld(out.set(0.37, 1.12, -0.2)); }

  serialize() {
    const o = this.mode === 'physics' ? (this.sleep(), this.park) : this.park;
    return { park: { x: o.pos.x, z: o.pos.z, yaw: o.yaw }, support: structuredClone(this.support), pt: { temp: this.pt.temp, gear: this.pt.gear } };
  }
  restore(d) {
    if (!d) return;
    this.park.pos.set(d.park.x, 0, d.park.z); this.park.yaw = d.park.yaw;
    this.support = d.support; this.pt.temp = d.pt?.temp ?? 15; this.pt.gear = d.pt?.gear ?? 0;
    this.mode = 'parked';
    this.applyCosmetics();
  }
}

const PUDDLE_OIL = new THREE.MeshStandardMaterial({ color: 0x140c04, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const PUDDLE_COOL = new THREE.MeshStandardMaterial({ color: 0x3aa850, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
