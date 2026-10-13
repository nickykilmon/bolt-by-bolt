// Run someone over with the car or the moped and the police turn up at your house the next day
// with a fine. You pay it whatever your bank balance says — debt included.
import * as THREE from 'three';
import { personModel, npcFace } from './npc.js';
import { carModel } from './traffic.js';
import { labelTex } from '../core/textures.js';
import { box } from '../mechanics/partMeshes.js';
import { MAT } from '../core/materials.js';
import { mulberry32 } from '../core/util.js';

const HOME_SPOT = new THREE.Vector3(5, 0, 14);   // where the officer waits in your yard
const CAR_SPOT = new THREE.Vector3(2.5, 0, 33);   // patrol car on the driveway

export class Police {
  constructor(game) {
    this.game = game;
    this.offenses = [];   // { who, mk, day, vehicle }
    this.cool = new Map();
    // the officer and the patrol car (hidden until a visit)
    this.officer = personModel(0x1a2a5a, 0x111111, npcFace(mulberry32(404), 0), 0x1a2a5a);
    this.officer.g.visible = false; game.scene.add(this.officer.g);
    this.officer.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => '<span class="k">E</span>Talk to the police officer', use: (b) => b === 'E' && this.settle(false) }; });
    const lamps = new THREE.MeshStandardMaterial({ color: 0xfff6e0 }), tails = new THREE.MeshStandardMaterial({ color: 0x801010 });
    const pc = carModel(0xf2f2f2, lamps, tails);
    box(pc.o, 1.66, 0.12, 1.2, MAT.bluePaint, 0, 0.66, 0.1);                      // blue band
    const bar = box(pc.o, 0.9, 0.12, 0.25, MAT.blackPaint, 0, 1.47, -0.3);
    this.flash = [0xff2020, 0x2040ff].map((c, i) => { const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 }); box(pc.o, 0.36, 0.1, 0.2, m, (i ? 0.22 : -0.22), 1.55, -0.3); return m; });
    for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshStandardMaterial({ map: labelTex('POLIISI', 256, 64, '#1a3a8a', '#fff', 'bold 44px Arial') })); t.position.set(s * 0.86, 0.66, 0.2); t.rotation.y = s * Math.PI / 2; pc.o.add(t); }
    this.car = pc.o; this.car.visible = false; game.scene.add(this.car);
    this.visit = null;
  }

  // ---------- running people over ----------
  check(dt) {
    const g = this.game;
    for (const [k, t] of this.cool) if (t - dt <= 0) this.cool.delete(k); else this.cool.set(k, t - dt);
    let vehicle = null, speed = 0, hitTest = null;
    if (g.player.inCar && g.car.mode === 'physics' && g.car.speed > 3) {
      vehicle = 'car'; speed = g.car.speed;
      const o = g.car.chassis.obj;
      hitTest = (p) => { const l = o.worldToLocal(p.clone()); return Math.abs(l.x) < 1.05 && Math.abs(l.z) < 2.3 && l.y > -0.5 && l.y < 2; };
    } else if (g.moped.riding && Math.abs(g.moped.speed) > 3) {
      vehicle = 'moped'; speed = Math.abs(g.moped.speed);
      hitTest = (p) => Math.hypot(p.x - g.moped.pos.x, p.z - g.moped.pos.z) < 0.9;
    }
    if (!vehicle) return;
    for (const n of g.npcs.list) {
      if (!n.present || !n.g.visible || n.down > 0 || this.cool.has(n.id)) continue;
      if (!hitTest(n.g.position.clone().add(new THREE.Vector3(0, 0.9, 0)))) continue;
      this.cool.set(n.id, 10);
      n.down = 8;
      const kmh = Math.round(speed * 3.6), mk = Math.round((vehicle === 'car' ? 200 : 120) + kmh * (vehicle === 'car' ? 6 : 4));
      this.offenses.push({ who: n.name.split(' (')[0], mk, day: g.life.day, vehicle, kmh });
      g.audio.crash(12);
      g.say(`${n.name.split(' ')[0]}: "${['AAARGH! My leg!', 'Are you blind?! I\'m calling the police!', 'OOF! You maniac!', 'Ow ow ow… I saw your plates!'][Math.floor(Math.random() * 4)]}"`, 4);
      g.toast(`🚓 You ran over ${n.name.split(' (')[0]} at ${kmh} km/h. Expect a visit from the police tomorrow.`, 5);
      g.life.cheer(-10, true);
      if (vehicle === 'moped' && speed > 6) { g.moped.speed *= 0.3; }
    }
  }

  // ---------- the visit, the day after ----------
  update(dt) {
    const g = this.game, L = g.life;
    this.check(dt);
    const due = this.offenses.filter((o) => o.day < L.day);
    if (due.length && !this.visit && L.hours >= 8 && L.hours < 18) this.startVisit();
    if (!this.visit) return;
    // lights flash while the car is parked
    const on = Math.sin(performance.now() * 0.012) > 0;
    this.flash[0].emissiveIntensity = on ? 2.5 : 0; this.flash[1].emissiveIntensity = on ? 0 : 2.5;
    const near = g.player.pos.distanceTo(HOME_SPOT) < 6;
    if (near && !this.visit.greeted) { this.visit.greeted = true; this.settle(false); }
    if (L.hours >= 18) this.settle(true); // you weren't home: the fine comes by post, with a late fee
  }
  startVisit() {
    const g = this.game;
    this.visit = { greeted: false };
    this.officer.g.position.set(HOME_SPOT.x, g.floorAt(HOME_SPOT.x, HOME_SPOT.z, 5), HOME_SPOT.z); this.officer.g.rotation.y = Math.PI * 0.9; this.officer.g.visible = true;
    this.car.position.set(CAR_SPOT.x, g.floorAt(CAR_SPOT.x, CAR_SPOT.z, 5), CAR_SPOT.z); this.car.rotation.y = Math.PI; this.car.visible = true;
    g.toast('🚓 A police car has pulled up at your house.', 5);
  }
  settle(byPost) {
    const g = this.game, L = g.life;
    const due = this.offenses.filter((o) => o.day < L.day);
    if (!due.length) { this.endVisit(); return; }
    let total = due.reduce((s, o) => s + o.mk, 0);
    if (byPost) total = Math.round(total * 1.25);
    const list = due.map((o) => `${o.who} (${o.kmh} km/h, ${o.vehicle})`).join(', ');
    g.addMoney(-total, `Police fine${byPost ? ' (by post, +25% late fee)' : ''}`);
    this.offenses = this.offenses.filter((o) => !due.includes(o));
    const debt = g.money < 0 ? ` That leaves you ${Math.abs(Math.round(g.money))} mk in debt.` : '';
    if (byPost) g.say(`A police fine came in the post: ${total} mk for running over ${list}. You weren't home, so there's a 25% late fee.${debt}`, 8);
    else g.ui.dialog('Officer Lahtinen', `Good morning. Yesterday you ran over ${list}. Witnesses, plates, the lot. The fine is ${total} mk — I've already taken it from your account.${debt} Drive like a human being.`, [{ label: 'Yes, officer.', go: () => {} }]);
    g.life.cheer(-5, true);
    this.endVisit();
  }
  endVisit() {
    if (!this.visit) return;
    this.visit = null;
    setTimeout(() => { this.officer.g.visible = false; this.car.visible = false; }, 4000);
  }
  serialize() { return { off: this.offenses }; }
  restore(d) { this.offenses = d?.off || []; }
}
