// Stray cats & dogs around Ruskala. Carry one home (on foot, in the moped box or in the car)
// to tame and name it. Feed it at least every 3 days or it dies. Pets cheer you up.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { YARD, ZONES } from './terrain.js';
import { mulberry32, clamp } from '../core/util.js';

const CAT_COLS = [0xd8822a, 0x1c1c1c, 0x8a8a8a, 0xeeeae0, 0x7a5232];
const DOG_COLS = [0x8a5a2a, 0x1e1a18, 0xd8b060, 0xe8e2d4, 0x5a4a3a];
const DAY = 1440;
const K = (k) => `<span class="k">${k}</span>`;

function petModel(kind, color, spot) {
  const g = new THREE.Group();
  const cat = kind === 'cat';
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const fur2 = new THREE.MeshStandardMaterial({ color: spot ?? color, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const s = cat ? 1 : 1.7; // overall size
  const bodyR = 0.085 * s, bodyL = 0.24 * s, legH = 0.14 * s;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, bodyL, 4, 10), fur); body.rotation.x = Math.PI / 2; body.position.y = legH + bodyR; g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(bodyR * 0.9, 10, 8), fur2); belly.scale.set(0.9, 0.7, 1.6); belly.position.set(0, legH + bodyR * 0.75, 0); g.add(belly);
  const headG = new THREE.Group(); headG.position.set(0, legH + bodyR * 2.0, bodyL / 2 + bodyR * 0.9); g.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.065 * s, 12, 10), fur); head.scale.set(1, 0.92, cat ? 0.95 : 1.05); headG.add(head);
  if (!cat) { const snout = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.05 * s, 0.07 * s), fur2); snout.position.set(0, -0.02 * s, 0.07 * s); headG.add(snout); const nose = new THREE.Mesh(new THREE.SphereGeometry(0.013 * s, 6, 5), dark); nose.position.set(0, -0.005 * s, 0.105 * s); headG.add(nose); }
  else { const nose = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), new THREE.MeshStandardMaterial({ color: 0xd07a7a })); nose.position.set(0, -0.01, 0.062); headG.add(nose); }
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011 * s, 6, 5), cat ? new THREE.MeshStandardMaterial({ color: 0x9ac030, emissive: 0x223300, roughness: 0.2 }) : dark);
    eye.position.set(sx * 0.026 * s, 0.015 * s, 0.052 * s); headG.add(eye);
    const ear = cat ? new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 4), fur) : new THREE.Mesh(new THREE.BoxGeometry(0.025 * s, 0.06 * s, 0.012 * s), fur2);
    if (cat) { ear.position.set(sx * 0.038, 0.06, -0.005); ear.rotation.z = -sx * 0.25; }
    else { ear.position.set(sx * 0.06 * s, 0.0, -0.01); ear.rotation.z = sx * 0.3; }
    headG.add(ear);
  }
  const legs = [];
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group(); hip.position.set(x * bodyR * 0.6, legH + bodyR * 0.6, z * bodyL * 0.42); g.add(hip);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.02 * s, legH, 3, 6), z > 0 ? fur : fur2); leg.position.y = -legH / 2 - 0.01; hip.add(leg);
    legs.push(hip);
  }
  const tail = new THREE.Group(); tail.position.set(0, legH + bodyR * 1.4, -bodyL / 2 - bodyR * 0.6); g.add(tail);
  const tl = new THREE.Mesh(new THREE.CapsuleGeometry(0.014 * s, cat ? 0.2 : 0.12 * s, 3, 6), fur); tl.position.y = (cat ? 0.1 : 0.06 * s); tail.add(tl);
  tail.rotation.x = cat ? -0.5 : -0.9;
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.4 * s, 0.5 * s), MAT.hit); hit.position.y = 0.2 * s; g.add(hit);
  g.traverse((o) => { if (o.isMesh && o.material !== MAT.hit) o.castShadow = true; });
  return { g, legs, tail, headG };
}

export class Pets {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.carried = null;
    this.graves = [];
    this.alertT = 0;
  }
  // a fresh set of strays around town (new game)
  seed() {
    const town = ZONES.find((z) => z.id === 'town');
    const r = mulberry32(77);
    const kinds = ['cat', 'cat', 'dog', 'cat', 'dog'];
    kinds.forEach((kind, i) => {
      const a = r() * Math.PI * 2, d = 25 + r() * 60;
      const home = { x: town.x + Math.cos(a) * d, z: town.z + Math.sin(a) * d };
      const cols = kind === 'cat' ? CAT_COLS : DOG_COLS;
      this.add({ id: 'pet' + i, kind, color: cols[Math.floor(r() * cols.length)], spot: r() < 0.5 ? 0xf2efe6 : null, home, x: home.x, z: home.z, owned: false, name: null, lastFed: 0 });
    });
  }
  add(d) {
    const p = { ...d, ...petModel(d.kind, d.color, d.spot), pos: new THREE.Vector3(d.x, 0, d.z), target: new THREE.Vector3(d.x, 0, d.z), walk: 0, idle: 0, loc: d.loc || 'world', petT: -999, wag: 0 };
    p.g.traverse((o) => { if (o.isMesh) o.userData.interact = { pet: true, prompt: () => this.prompt(p), use: (b) => this.use(p, b) }; });
    this.game.scene.add(p.g);
    this.list.push(p);
    this.place(p);
    return p;
  }
  label(p) { return p.name || `the stray ${p.kind}`; }
  hoursSinceFed(p) { return (this.game.life.minutes - p.lastFed) / 60; }
  hungerPct(p) { return clamp(100 - this.hoursSinceFed(p) / 48 * 100, 0, 100); }

  // ---------- interaction ----------
  prompt(p) {
    const g = this.game, held = g.interaction.held;
    if (!p.owned) return held ? `A stray ${p.kind} <span class="dim">(hands full)</span>` : `${K('E')}Pick up the stray ${p.kind} <span class="dim">(take it home to adopt it)</span>`;
    const h = this.hungerPct(p);
    const mood = h < 25 ? '<span class="bad">starving!</span>' : h < 60 ? 'hungry' : 'happy';
    let s = `${p.name} the ${p.kind} <span class="dim">(${mood})</span>\n`;
    if (held?.def.kind === 'food') s += `${K('LMB')}Feed ${p.name} the ${held.def.name.toLowerCase()}\n`;
    s += `${K('E')}Pet ${p.name}` + (held ? '' : `\n${K('F')}Pick up ${p.name}`);
    return s;
  }
  use(p, b) {
    const g = this.game, held = g.interaction.held;
    if (!p.owned) { if (b === 'E' && !held) this.pickUp(p); return; }
    if (b === 'LMB' && held?.def.kind === 'food') return this.feed(p, g.interaction.release());
    if (b === 'E') return this.pet(p);
    if (b === 'F' && !held) this.pickUp(p);
  }
  pickUp(p) {
    const g = this.game;
    if (this.carried) return;
    this.carried = p; p.loc = 'carried';
    g.camera.add(p.g);
    p.g.position.set(0.05, -0.38, -0.55); p.g.rotation.set(0, Math.PI / 2 + 0.3, 0);
    this.sound(p);
    g.toast(p.owned ? `Picked up ${p.name}` : `Picked up the stray ${p.kind}. Take it home to adopt it — walk, or put it in the moped box or the car.`, 4);
  }
  dropAt(p, x, z, y) {
    const g = this.game;
    g.scene.add(p.g); p.loc = 'world';
    p.pos.set(x, y ?? g.floorAt(x, z, 2), z); p.target.copy(p.pos);
    if (this.carried === p) this.carried = null;
    this.place(p);
  }
  // while carrying a pet the hands are busy: put it down, or into the moped box / car
  carryPrompt(input) {
    const g = this.game, p = this.carried, P = g.player.pos;
    const nearMoped = g.moped.pos.distanceTo(P) < 2.2, carP = g.car.chassis.obj.position, nearCar = Math.hypot(carP.x - P.x, carP.z - P.z) < 3.2;
    let s = `Carrying ${this.label(p)}\n`;
    if (nearMoped) s += `${K('E')}Put ${this.label(p)} in the moped box\n`;
    else if (nearCar) s += `${K('E')}Put ${this.label(p)} in the car boot\n`;
    s += `${K('G')}Put down`;
    if (input.hit('KeyE') && nearMoped) { this.carried = null; p.loc = 'moped'; g.moped.rack.add(p.g); p.g.position.set(0, 0.03, 0); p.g.rotation.set(0, 0, 0); p.g.scale.setScalar(p.kind === 'dog' ? 0.7 : 1); this.sound(p); g.toast(`${this.label(p)} is in the moped box`, 2); }
    else if (input.hit('KeyE') && nearCar) { this.carried = null; p.loc = 'car'; g.car.chassis.obj.add(p.g); p.g.position.set(0, 0.62, -1.7); p.g.rotation.set(0, 0, 0); this.sound(p); g.toast(`${this.label(p)} is in the car boot`, 2); }
    else if (input.hit('KeyG')) { const f = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw)); this.dropAt(p, P.x + f.x * 0.7, P.z + f.z * 0.7, g.floorAt(P.x + f.x * 0.7, P.z + f.z * 0.7, P.y + 0.5)); }
    return s;
  }
  feed(p, food) {
    const g = this.game;
    g.asm.remove(food);
    p.lastFed = g.life.minutes; p.warned = 0;
    g.audio.eat(); this.sound(p);
    g.life.cheer(4);
    g.toast(`${p.name} gobbled up the ${food.def.name.toLowerCase()} ♥`, 3);
  }
  pet(p) {
    const g = this.game;
    p.wag = 2.5; this.sound(p);
    if (g.life.minutes - p.petT > 20) { p.petT = g.life.minutes; g.life.cheer(6); g.toast(`You pet ${p.name}. ${p.kind === 'cat' ? 'Purrrr…' : 'Happy tail wags!'} (+happiness)`, 2.5); }
    else g.toast(`${p.name} enjoys it.`, 1.5);
  }
  sound(p) {
    const a = this.game.audio;
    if (p.kind === 'cat') { a.tone(620, 'triangle', 0.05, 0.12, 1.4); setTimeout(() => a.tone(860, 'triangle', 0.05, 0.3, 0.6), 110); }
    else { a.burst(420, 1.5, 0.25, 0.09, 'bandpass'); setTimeout(() => a.burst(380, 1.5, 0.22, 0.1, 'bandpass'), 180); }
  }

  // ---------- taming ----------
  tame(p) {
    const g = this.game;
    this.taming = true;
    g.ui.panel(`<h2>You brought a stray ${p.kind} home!</h2><div>It looks around the yard and decides to stay. What will you call it?</div>
      <label style="margin-top:8px">Name <input id="petName" maxlength="20" placeholder="${p.kind === 'cat' ? 'Mittens' : 'Rex'}" style="font-size:18px;padding:4px 8px"></label>
      <div class="muted">Feed it every day (pet food from the village shop, or any food). After 3 days without food it will die.</div>
      <button id="petOk">Adopt</button>`, (el) => {
      const inp = el.querySelector('#petName'); inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') el.querySelector('#petOk').click(); }); setTimeout(() => inp.focus(), 50);
      el.querySelector('#pnClose').style.display = 'none';
      el.querySelector('#petOk').onclick = () => {
        p.name = inp.value.trim().slice(0, 20) || (p.kind === 'cat' ? 'Mittens' : 'Rex');
        p.owned = true; p.lastFed = g.life.minutes; p.home = { x: YARD.x + 3, z: YARD.z + 8 };
        if (p.loc === 'moped' || p.loc === 'car') { const w = p.g.getWorldPosition(new THREE.Vector3()); p.g.scale.setScalar(1); this.dropAt(p, w.x + 1, w.z + 0.5); }
        this.taming = false;
        g.ui.closeModal();
        g.life.cheer(20);
        g.say(`${p.name} is part of the family now! Remember to feed ${p.kind === 'cat' ? 'her' : 'him'} every day.`, 6);
        g.saveGame(true);
      };
    });
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game, L = g.life;
    for (const p of this.list) {
      if (p.dead) continue;
      const wp = p.loc === 'world' ? p.pos : p.g.getWorldPosition(new THREE.Vector3());
      // arriving home with a stray → adopt it
      if (!p.owned && !this.taming && Math.hypot(wp.x - YARD.x, wp.z - YARD.z) < YARD.r - 4 && !g.ui.modal) { this.tame(p); continue; }
      if (p.owned) {
        const hrs = this.hoursSinceFed(p);
        if (hrs >= 72) { this.die(p); continue; }
        // hunger alerts
        const level = hrs >= 48 ? 3 : hrs >= 30 ? 2 : hrs >= 20 ? 1 : 0;
        p.alertAt = p.alertAt ?? 0;
        if (level && L.minutes >= p.alertAt) {
          p.alertAt = L.minutes + (level === 3 ? 60 : 120);
          const msg = level === 3 ? `⚠ ${p.name} is starving! Feed ${p.name} now or ${p.kind === 'cat' ? 'she' : 'he'} will die.` : level === 2 ? `${p.name} is very hungry!` : `${p.name} is hungry.`;
          g.toast('🐾 ' + msg, 5); if (level >= 2) g.say(msg, 4);
        }
        // having pets around cheers you up
        if (p.loc === 'world' && p.pos.distanceTo(g.player.pos) < 8) L.cheer(dt / 60 * 0.6, true);
      }
      if (p.loc !== 'world') { this.animate(p, dt, false); continue; }
      // wander around home
      p.idle -= dt;
      const to = new THREE.Vector3().subVectors(p.target, p.pos); to.y = 0;
      const moving = to.length() > 0.2 && p.idle <= 0;
      if (moving) {
        const sp = p.kind === 'cat' ? 0.7 : 1.1;
        p.pos.addScaledVector(to.normalize(), Math.min(sp * dt, to.length()));
        p.g.rotation.y = Math.atan2(to.x, to.z);
      } else if (p.idle <= 0) {
        const r = p.owned ? 9 : 14, a = Math.random() * Math.PI * 2, d = Math.random() * r;
        // owned pets like to hang around you when you're home
        const nearMe = p.owned && g.player.pos.distanceTo(p.pos) < 25 && Math.random() < 0.5;
        const c = nearMe ? g.player.pos : p.home;
        p.target.set(c.x + Math.cos(a) * (nearMe ? 2 : d), 0, c.z + Math.sin(a) * (nearMe ? 2 : d));
        p.idle = 2 + Math.random() * 6;
      }
      p.pos.y = g.floorAt(p.pos.x, p.pos.z, p.pos.y + 0.5);
      this.place(p);
      this.animate(p, dt, moving);
    }
    // HUD line for your pets
    this.hud = this.list.filter((p) => p.owned && !p.dead).map((p) => ({ name: p.name, kind: p.kind, h: this.hungerPct(p) }));
  }
  animate(p, dt, moving) {
    p.walk += dt * (moving ? 10 : 0);
    p.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(p.walk + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.5 : 0; });
    p.wag = Math.max(0, p.wag - dt);
    p.tail.rotation.z = Math.sin(performance.now() * (p.wag > 0 ? 0.03 : 0.004)) * (p.wag > 0 ? 0.6 : 0.2);
  }
  place(p) { if (p.loc === 'world') { p.g.position.copy(p.pos); } }

  die(p) {
    const g = this.game;
    p.dead = true;
    if (this.carried === p) this.carried = null;
    p.g.parent?.remove(p.g);
    const gr = { x: YARD.x + 12 + this.graves.length * 1.2, z: YARD.z + 14, name: p.name };
    this.graves.push(gr); this.buildGrave(gr);
    g.life.grieve(p.name);
    g.ui.dialog('💔 ' + p.name, `${p.name} hasn't eaten in three days and passed away. You buried ${p.kind === 'cat' ? 'her' : 'him'} at the edge of the yard. You feel terrible.`, [{ label: 'OK', go: () => {} }]);
  }
  buildGrave(gr) {
    const g = this.game, o = new THREE.Group(), y = g.floorAt(gr.x, gr.z, 2);
    o.position.set(gr.x, y, gr.z);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 1 })); mound.scale.set(1, 0.4, 1.6); o.add(mound);
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.04), wood); v.position.set(0, 0.25, -0.45); o.add(v);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.04), wood); h.position.set(0, 0.36, -0.45); o.add(h);
    o.traverse((m) => { if (m.isMesh) m.userData.interact = { prompt: () => `Here lies ${gr.name}. <span class="dim">Feed your pets…</span>`, use: () => {} }; });
    g.scene.add(o); this.graveObjs = this.graveObjs || []; this.graveObjs.push(o);
  }

  // ---------- save ----------
  serialize() {
    return {
      pets: this.list.filter((p) => !p.dead).map((p) => ({ id: p.id, kind: p.kind, color: p.color, spot: p.spot, home: p.home, x: p.loc === 'world' ? p.pos.x : this.game.player.pos.x, z: p.loc === 'world' ? p.pos.z : this.game.player.pos.z, owned: p.owned, name: p.name, lastFed: p.lastFed })),
      graves: this.graves,
    };
  }
  restore(d) {
    for (const p of this.list) p.g.parent?.remove(p.g);
    this.list = []; this.carried = null;
    for (const x of d?.pets || []) this.add(x);
    for (const o of this.graveObjs || []) o.parent?.remove(o); this.graveObjs = [];
    this.graves = d?.graves || []; for (const gr of this.graves) this.buildGrave(gr);
    if (!d) this.seed();
  }
}
