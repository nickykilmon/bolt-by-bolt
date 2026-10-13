// Jari, Ruskala's street racer. Evenings (20–03) he hangs out at the gas station with his black
// Opel. Bet him and race down Route 54 from the gas station to the Pertti's-road turn-off.
// Every time you beat him he comes back with more power.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box } from '../mechanics/partMeshes.js';
import { ROADS, ZONES, groundY } from './terrain.js';
import { personModel, npcFace } from './npc.js';
import { carModel } from './traffic.js';
import { mulberry32, clamp, fmtMoney } from '../core/util.js';

const K = (k) => `<span class="k">${k}</span>`;
const PARK = new THREE.Vector3(494, 0, 102);

export class Rival {
  constructor(game) {
    this.game = game;
    this.T = ZONES.find((z) => z.id === 'town').h;
    this.wins = 0; this.losses = 0; this.lastNight = -1;
    this.state = null;   // null | 'lineup' | 'count' | 'race' | 'done'
    this.root = new THREE.Group(); game.scene.add(this.root);
    // the route: Route 54 samples, westbound, from the gas station to the Pertti's road junction
    const s = ROADS.find((r) => r.name === 'Route 54').samples;
    const near = (x) => s.reduce((b, p, i) => (Math.abs(p.x - x) < Math.abs(s[b].x - x) ? i : b), 0);
    const i0 = near(470), i1 = near(-205);
    this.path = s.slice(i1, i0 + 1).reverse().map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.dist = [0]; for (let i = 1; i < this.path.length; i++) this.dist.push(this.dist[i - 1] + this.path[i].distanceTo(this.path[i - 1]));
    this.len = this.dist[this.dist.length - 1];
    // corner speed limit at each sample (from how much the road turns over ~24 m)
    this.vc = this.path.map((p, i) => {
      const a = this.path[Math.max(0, i - 6)], b = this.path[Math.min(this.path.length - 1, i + 6)];
      const h1 = Math.atan2(p.x - a.x, p.z - a.z), h2 = Math.atan2(b.x - p.x, b.z - p.z);
      const turn = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) + 1e-4;
      return Math.sqrt(8 * (a.distanceTo(b) / turn));
    });
    this.start = this.at(0, 0).p; this.finish = this.path[this.path.length - 1].clone();
    // Jari and his car
    const lamps = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff2c0, emissiveIntensity: 2, roughness: 0.2 });
    const tails = new THREE.MeshStandardMaterial({ color: 0x801010, emissive: 0xff1010, emissiveIntensity: 1.2, roughness: 0.3 });
    const { o, wheels } = carModel(0x101010, lamps, tails);
    const stripe = new THREE.MeshStandardMaterial({ color: 0xff7a10, roughness: 0.4 });
    for (const sx of [-0.2, 0.2]) { box(o, 0.14, 0.012, 1.15, stripe, sx, 0.915, 1.5); box(o, 0.14, 0.012, 1.3, stripe, sx, 1.39, -0.37); }
    box(o, 1.5, 0.04, 0.3, MAT.darkSteel, 0, 1.15, -1.98); // wing
    this.car = o; this.wheels = wheels; this.root.add(o);
    this.jari = personModel(0x111111, 0x1a2a4a, npcFace(mulberry32(1337), 1), null);
    this.root.add(this.jari.g);
    this.jari.g.traverse((m) => { if (m.isMesh) m.userData.interact = { prompt: () => `${K('E')}Talk to Jari <span class="dim">(street racer)</span>`, use: (b) => b === 'E' && this.talk() }; });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 4.5), MAT.hit); hit.position.y = 0.75; o.add(hit);
    hit.userData.interact = { prompt: () => 'Jari\'s black Opel <span class="dim">— don\'t touch the paint</span>', use: () => {} };
    this.park();
    game.rivalPos = PARK.clone().setY(this.T);
  }
  // position & heading along the race path at distance d, offset sideways (positive = right of travel)
  at(d, side) {
    let i = 1; while (i < this.dist.length - 1 && this.dist[i] < d) i++;
    const a = this.path[i - 1], b = this.path[i], t = clamp((d - this.dist[i - 1]) / Math.max(0.01, this.dist[i] - this.dist[i - 1]), 0, 1);
    const f = b.clone().sub(a).normalize(), p = a.clone().lerp(b, t);
    p.x += -f.z * side; p.z += f.x * side; p.y = groundY(p.x, p.z);
    return { p, yaw: Math.atan2(f.x, f.z), i };
  }
  park() {
    this.car.position.set(PARK.x, groundY(PARK.x, PARK.z), PARK.z); this.car.rotation.set(0, Math.PI / 2, 0);
    this.jari.g.position.set(PARK.x - 1.2, groundY(PARK.x - 1.2, PARK.z + 2.2), PARK.z + 2.2); this.jari.g.rotation.y = Math.PI;
    this.jari.g.visible = true;
  }
  nightKey() { const L = this.game.life; return L.hours < 12 ? L.day - 1 : L.day; }
  around() { const h = this.game.life.hours; return h >= 20 || h < 3; }
  level() { return Math.min(this.wins, 6); }
  vmax() { return 28 + this.level() * 3; } // 100 km/h first time, up to ~165 km/h
  playerVehicle() {
    const g = this.game;
    if (g.player.inCar) return { pos: g.car.chassis.obj.position, speed: g.car.speed, name: 'your Ruska' };
    if (g.activeWorkVehicle) return { pos: g.activeWorkVehicle.pos, speed: Math.abs(g.activeWorkVehicle.speed), name: `the ${g.activeWorkVehicle.name}` };
    if (g.moped.riding) return { pos: g.moped.pos, speed: Math.abs(g.moped.speed), name: 'the moped' };
    return null;
  }
  talk() {
    const g = this.game;
    if (this.state) { g.say('Jari: "Line up already. Left lane, next to me."', 3); return; }
    if (!this.around()) return;
    if (this.lastNight === this.nightKey()) { g.ui.dialog('Jari', this.lastWon ? '"You got lucky. Tomorrow night. I\'m tuning her up."' : '"Already beat you tonight. Go home, practice."', [{ label: 'OK', go: () => {} }]); return; }
    const intro = this.wins === 0 && this.losses === 0
      ? '"You. Yeah, you. I\'ve seen that thing you drive. Race me. Gas station to the Pertti\'s road turn-off on 54, westbound. Loser pays."'
      : this.wins ? `"${['Fine, you won last time.', 'I put a new cam in her.', 'Bigger turbo this time.', 'She\'s making real power now.', 'Nobody beats me twice in a row.', 'This is personal now.'][Math.min(this.wins - 1, 5)]} Same route. Same deal."` : '"Back for another beating? Same route."';
    g.ui.dialog('Jari (street racer)', `${intro}\n\nRecord: you ${this.wins} – Jari ${this.losses}. Win and you get double your bet back.`, [
      ...[100, 300, 800].map((b) => ({ label: `Race for ${fmtMoney(b)}`, go: () => this.accept(b) })),
      { label: 'Not tonight', go: () => {} },
    ]);
  }
  accept(bet) {
    const g = this.game;
    if (g.money < bet) { g.say(`Jari: "You don't even have ${fmtMoney(bet)}? Pathetic."`, 3); return; }
    this.bet = bet; this.state = 'lineup';
    const s = this.at(0, 1.8); // Jari takes the right lane
    this.car.position.copy(s.p); this.car.rotation.set(0, s.yaw, 0);
    this.jari.g.visible = false;
    g.jobs.focus = 'race';
    g.say('Jari: "Bring your car to the line. Left lane. I\'ll count you in."', 4);
  }
  cancel(msg = true) {
    this.state = null; this.park();
    if (this.game.jobs.focus === 'race') this.game.jobs.focus = null;
    if (msg) this.game.say('Jari: "Chicken."', 3);
  }
  update(dt) {
    const g = this.game, around = this.around() || this.state;
    this.car.visible = !!around; this.jari.g.visible = !!around && !this.state;
    if (!this.state) return;
    const pv = this.playerVehicle();
    if (this.state === 'lineup') {
      if (!this.around()) { this.cancel(false); return; }
      if (pv && pv.pos.distanceTo(this.at(0, -1.8).p) < 9 && pv.speed < 1) { this.state = 'count'; this.cnt = 3.6; this.lastBeep = 4; g.addMoney(-this.bet, 'Street race bet'); }
      return;
    }
    if (this.state === 'count') {
      this.cnt -= dt;
      const n = Math.ceil(this.cnt);
      if (n !== this.lastBeep && n <= 3) { this.lastBeep = n; if (n > 0) { g.say(`${n}…`, 0.9); g.audio.beep(false); } }
      if (this.cnt <= 0) { this.state = 'race'; this.d = 0; this.v = 0; this.t = 0; this.offT = 0; g.say('GO!', 1.2); g.audio.beep(true); }
      return;
    }
    if (this.state === 'race') {
      this.t += dt;
      // Jari: accelerate to the lower of his top speed and the corner limit coming up
      let lim = this.vmax();
      for (let k = 0, i = this.at(this.d, 0).i; k < 30 && i + k < this.vc.length; k++) lim = Math.min(lim, this.vc[i + k] + k * 0.6);
      this.v += clamp(lim - this.v, -9 * dt, (4.2 + this.level() * 0.25) * dt);
      this.d += this.v * dt;
      const s = this.at(Math.min(this.d, this.len), 1.8);
      this.car.position.copy(s.p); this.car.rotation.set(0, s.yaw, 0);
      for (const w of this.wheels) w.rotation.x += this.v * dt / 0.32;
      if (this.d >= this.len) return this.finishRace(false);
      if (pv && this.t > 5 && Math.hypot(pv.pos.x - this.finish.x, pv.pos.z - this.finish.z) < 16) return this.finishRace(true);
      if (!pv) { this.offT += dt; if (this.offT > 8) { g.say('You got out of your car. That\'s a forfeit.', 4); return this.finishRace(false); } } else this.offT = 0;
      return;
    }
  }
  finishRace(won) {
    const g = this.game;
    this.state = null; this.lastNight = this.nightKey(); this.lastWon = won;
    if (g.jobs.focus === 'race') g.jobs.focus = null;
    if (won) {
      this.wins++; g.addMoney(this.bet * 2, 'Beat Jari in a street race'); g.life.cheer(15);
      g.ach?.unlock('street_race'); if (this.wins >= 5) g.ach?.unlock('street_king');
      g.say(`YOU WIN! ${fmtMoney(this.bet * 2)}. Jari slams his steering wheel. "${this.wins >= 3 ? 'How?! HOW?!' : 'Next time.'}"`, 6);
    } else {
      this.losses++;
      g.say(`Jari wins. ${fmtMoney(this.bet)} gone. He leans out the window: "Nice try, grandma."`, 6);
    }
    setTimeout(() => { if (!this.state) this.park(); }, 12000);
  }
  objective(mark, dist, also) {
    const J = 'STREET RACE', pv = this.playerVehicle();
    if (this.state === 'lineup') {
      const line = this.at(0, -1.8).p;
      if (!pv) return { job: J, st: { title: 'Get your car' }, s: { text: `Bring your car (or any ride) to the start line by the gas station and stop next to Jari's black Opel — left lane, facing west.${also}`, targets: [mark(line, 'Start line', '#ff9a3c', 1)] } };
      return { job: J, st: { title: 'Line up at the start' }, s: { text: `Stop on the marker in the left lane next to Jari (${dist(line)} m). He'll count you in. Bet: ${fmtMoney(this.bet)}.${also}`, targets: [mark(line, 'Start line — stop here', '#ff9a3c', 1)] } };
    }
    if (this.state === 'count') return { job: J, st: { title: 'Get ready…' }, s: { text: 'Hold the brake. GO on zero.', targets: [] } };
    if (this.state === 'race') {
      const left = Math.max(0, Math.round(this.len - this.d));
      return { job: J, st: { title: 'RACE! Route 54 west to the Pertti\'s road turn-off' }, s: { text: `Finish line ${dist(this.finish)} m away. Jari has ${left} m to go.`, targets: [mark(this.finish, 'FINISH', '#ff3030', 2)] } };
    }
    return null;
  }
  serialize() { return { wins: this.wins, losses: this.losses, last: this.lastNight, lastWon: this.lastWon }; }
  restore(d) { if (!d) return; this.wins = d.wins || 0; this.losses = d.losses || 0; this.lastNight = d.last ?? -1; this.lastWon = !!d.lastWon; }
}
