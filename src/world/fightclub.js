// The church in Ruskala — and what's under it. Walk in, down the stairs, through the cellar door
// (open at night, when the doorman is there) into "The Cellar": an underground fighting ring.
// Bet on fights at the bookie, or step into the ring yourself: LMB punch, RMB block.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { CELLAR, ZONES } from './terrain.js';
import { addCollider, FLOORS, UNDERGROUND } from './colliders.js';
import { mats } from './buildings.js';
import { labelTex } from '../core/textures.js';
import { personModel, npcFace } from './npc.js';
import { mulberry32, clamp, fmtMoney } from '../core/util.js';

const K = (k) => `<span class="k">${k}</span>`;
const OPEN_FROM = 21, OPEN_TO = 4; // fight night: 21:00 - 04:00
export const FIGHTERS = [
  { name: 'Pasi "Puukko" Pöllänen', hp: 70, dmg: 7, speed: 1.4, wind: 0.55, block: 0.1, cd: 1.6, prize: 150, shirt: 0x6a6a6a, pants: 0x2a2a2a },
  { name: 'Reijo "Rauta" Rautio', hp: 90, dmg: 9, speed: 1.6, wind: 0.5, block: 0.2, cd: 1.4, prize: 300, shirt: 0x8a2a1a, pants: 0x1a1a1a },
  { name: 'Tuomas "Tukki" Tukiainen', hp: 115, dmg: 10, speed: 1.5, wind: 0.48, block: 0.25, cd: 1.3, prize: 500, shirt: 0x2a4a2a, pants: 0x3a2a1a },
  { name: 'Jarkko "Jäänsärkijä" Järvi', hp: 125, dmg: 12, speed: 1.9, wind: 0.42, block: 0.35, cd: 1.15, prize: 800, shirt: 0x1a2a6a, pants: 0x111111 },
  { name: 'Iso-Jussi', hp: 160, dmg: 15, speed: 1.7, wind: 0.38, block: 0.4, cd: 1.05, prize: 1500, shirt: 0x111111, pants: 0x111111 },
];

export class FightClub {
  constructor(game) {
    this.game = game;
    this.T = ZONES.find((z) => z.id === 'town').h;
    this.F = this.T - CELLAR.depth;           // cellar floor height
    this.rank = 0; this.wins = 0;
    this.rnd = mulberry32(31337);
    this.buildChurch();
    this.buildStairs();
    this.buildCellar();
    this.fight = null; this.bet = null; this.match = null;
    this.fistsBuilt = false;
  }
  isNight() { const h = this.game.life.hours; return h >= OPEN_FROM || h < OPEN_TO; }

  // ---------------- the church ----------------
  buildChurch() {
    const g = this.game, T = this.T, cx = CELLAR.x, cz = CELLAR.z;
    const ch = new THREE.Group(); ch.position.set(cx, T, cz); g.scene.add(ch);
    const W = mats.white, wood = MAT.wood;
    const wall = (lx, ly, lz, w, h, d, mat = W) => { const m = box(ch, w, h, d, mat, lx, ly, lz); m.castShadow = m.receiveShadow = true; addCollider(cx + lx - w / 2, T + ly - h / 2, cz + lz - d / 2, cx + lx + w / 2, T + ly + h / 2, cz + lz + d / 2); return m; };
    wall(0, 3, -5.5, 7, 6, 0.25);                       // back
    wall(-3.5, 3, 0, 0.25, 6, 11); wall(3.5, 3, 0, 0.25, 6, 11); // sides
    wall(-2.15, 3, 5.5, 2.7, 6, 0.25); wall(2.15, 3, 5.5, 2.7, 6, 0.25); // front, either side of the door
    wall(0, 4.6, 5.5, 1.6, 2.8, 0.25);                 // over the door
    for (const s of [1, -1]) { const r = box(ch, 7.6, 0.1, 6.2, mats.roof, 0, 7.2, 0); r.rotation.z = s * 0.6; r.position.x = s * 1.6; r.scale.set(0.55, 1, 1.95); r.castShadow = true; }
    box(ch, 7, 0.08, 11, W, 0, 6.02, 0); // ceiling
    const tower = new THREE.Group(); tower.position.set(0, 0, -6.5); ch.add(tower);
    const tw = box(tower, 3, 12, 3, W, 0, 6, 0); tw.castShadow = true; addCollider(cx - 1.5, T, cz - 8, cx + 1.5, T + 12, cz - 5);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 4), mats.roof); spire.position.set(0, 15, 0); spire.rotation.y = Math.PI / 4; tower.add(spire);
    // stone plinth around the base
    const stone = new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.95 });
    box(ch, 8.4, 0.5, 12.4, stone, 0, 0.0, 0).receiveShadow = true;
    // floor with the stairwell opening (x -0.7..0.7, z -5..3 in church frame)
    const floorM = mats.woodFloor;
    const fl = (x0, x1, z0, z1) => { const m = box(ch, x1 - x0, 0.1, z1 - z0, floorM, (x0 + x1) / 2, 0.05, (z0 + z1) / 2); m.receiveShadow = true; m.userData.surface = true; addCollider(cx + x0, T - 0.5, cz + z0, cx + x1, T + 0.1, cz + z1, { walkable: true, car: false }); };
    fl(-3.4, -0.75, -5.4, 5.4); fl(0.75, 3.4, -5.4, 5.4); fl(-0.75, 0.75, 3, 5.4); fl(-0.75, 0.75, -5.4, -5.0);
    // railings along the stairwell
    for (const sx of [-0.8, 0.8]) { box(ch, 0.06, 0.9, 8, wood, sx, 0.55, -1); box(ch, 0.08, 0.06, 8, wood, sx, 1.0, -1); addCollider(cx + sx - 0.05, this.F, cz - 5, cx + sx + 0.05, T + 1.1, cz + 3); }
    // pews, altar, candles, a light
    for (let i = 0; i < 4; i++) for (const sx of [-2.3, 2.3]) { box(ch, 1.6, 0.45, 0.4, wood, sx, 0.4, 1.8 - i * 1.4); box(ch, 1.6, 0.6, 0.06, wood, sx, 0.75, 1.62 - i * 1.4); }
    box(ch, 1.6, 1, 0.7, wood, -2.3, 0.6, -4.6); cyl(ch, 0.03, 0.25, MAT.whitePlastic, -2.6, 1.22, -4.6, 'y', 6); cyl(ch, 0.03, 0.25, MAT.whitePlastic, -2.0, 1.22, -4.6, 'y', 6);
    const lamp = new THREE.PointLight(0xffd8a0, 6, 12, 1.5); lamp.position.set(0, 4.5, 0); ch.add(lamp);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.4), new THREE.MeshStandardMaterial({ map: labelTex('RUSKALAN KIRKKO · Ruskala Church', 512, 92, '#f4f0e6', '#333', 'bold 34px Georgia') }));
    sign.position.set(0, 3.6, 5.64); ch.add(sign);
    this.church = ch;
  }
  // ---------------- the staircase down (church frame z 3 -> -5, then the corridor) ----------------
  buildStairs() {
    const g = this.game, T = this.T, F = this.F, cx = CELLAR.x, cz = CELLAR.z;
    const stoneM = new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.95 });
    const z0 = cz + 3, z1 = cz - 5; // top, bottom
    const n = 18;
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const m = box(g.scene, 1.4, 0.28, (z0 - z1) / n + 0.02, stoneM, cx, T - t * (T - F) - 0.14 + 0.05, z0 - t * (z0 - z1)); m.receiveShadow = true; }
    // walk on a smooth ramp
    FLOORS.push((x, z) => (x > cx - 0.75 && x < cx + 0.75 && z <= z0 && z >= z1 ? T + 0.05 - ((z0 - z) / (z0 - z1)) * (T + 0.05 - F) : null));
    // stairwell walls below the church floor
    for (const sx of [-0.75, 0.75]) box(g.scene, 0.1, T - F + 0.2, z0 - z1 + 0.4, stoneM, cx + sx + Math.sign(sx) * 0.05, (T + F) / 2, (z0 + z1) / 2);
    // corridor to the cellar door (z cz-5 .. cz-9), floor F
    const cz0 = cz - 5, cz1 = cz - 9.2;
    const fm = box(g.scene, 1.6, 0.2, cz0 - cz1, stoneM, cx, F - 0.1, (cz0 + cz1) / 2); fm.receiveShadow = true;
    addCollider(cx - 0.8, F - 0.6, cz1, cx + 0.8, F, cz0 + 0.2, { walkable: true, car: false });
    for (const sx of [-0.85, 0.85]) { box(g.scene, 0.1, 2.6, cz0 - cz1, stoneM, cx + sx, F + 1.3, (cz0 + cz1) / 2); addCollider(cx + sx - 0.05, F, cz1, cx + sx + 0.05, F + 2.6, cz0); }
    box(g.scene, 1.8, 0.1, cz0 - cz1, stoneM, cx, F + 2.6, (cz0 + cz1) / 2).castShadow = true; // corridor ceiling
    const bulb = new THREE.PointLight(0xffc880, 3, 7, 1.6); bulb.position.set(cx, F + 2.3, cz - 6.5); g.scene.add(bulb);
    cyl(g.scene, 0.05, 0.1, mats.fluoro || MAT.lens, cx, F + 2.45, cz - 6.5, 'y', 8);
    // the cellar door (hinged, E to open — locked during the day)
    const hinge = new THREE.Group(); hinge.position.set(cx - 0.7, F, cz1 + 0.05); g.scene.add(hinge);
    const door = box(hinge, 1.4, 2.2, 0.08, new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 }), 0.7, 1.1, 0);
    box(hinge, 0.08, 0.08, 0.06, MAT.brass, 1.25, 1.05, 0.06);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), new THREE.MeshStandardMaterial({ map: labelTex('PRIVATE', 256, 76, '#1a1a1a', '#c03020', 'bold 46px Impact') }));
    sign.position.set(0.7, 1.75, 0.05); hinge.add(sign);
    this.doorCol = addCollider(cx - 0.8, F, cz1 - 0.05, cx + 0.8, F + 2.3, cz1 + 0.12);
    this.door = { hinge, open: 0, target: 0 };
    door.userData.interact = { prompt: () => this.doorPrompt(), use: (b) => { if (b === 'E') this.useDoor(); } };
    g.animated.push((dt) => {
      const d = this.door; d.open += clamp(d.target - d.open, -dt * 2, dt * 2); hinge.rotation.y = -d.open * 1.6;
      // collider follows: open door = no collider
      this.doorCol.min.y = d.open > 0.5 ? -1e4 : F; this.doorCol.max.y = d.open > 0.5 ? -1e4 : F + 2.3;
    });
    UNDERGROUND.push({ minX: cx - 3.4, maxX: cx + 3.4, minZ: cz - 9.4, maxZ: cz + 5.4, top: T - 0.6 }); // stairwell + corridor
    // the doorman (fight nights only)
    this.doorman = personModel(0x1a1a1a, 0x1a1a1a, npcFace(mulberry32(7), 4), null);
    this.doorman.g.position.set(cx + 0.55, F, cz1 + 0.9); this.doorman.g.scale.setScalar(1.08); g.scene.add(this.doorman.g);
    this.doorman.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => `${K('E')}Talk to the doorman`, use: (b) => { if (b === 'E') { if (this.door.target) g.say('Doorman: "In or out, make up your mind."'); else this.useDoor(); } } }; });
    this.pickRoots = [this.church, hinge, this.doorman.g];
  }
  insideCellar() { return this.game.player.pos.z < CELLAR.z - 9.2 && this.game.player.pos.y < this.T - 2; }
  doorPrompt() {
    if (this.door.target) return `${K('E')}Close the door`;
    if (this.insideCellar()) return `${K('E')}Open the door <span class="dim">(it unlocks from the inside)</span>`;
    if (!this.isNight()) return `Cellar door — locked. <span class="dim">A note: "Fight night 21:00–04:00. Members only."</span>`;
    return `${K('E')}Knock on the cellar door`;
  }
  useDoor() {
    const g = this.game;
    if (this.door.target) { this.door.target = 0; g.audio.door(false, 'door'); return; }
    if (this.insideCellar()) { this.door.target = 1; g.audio.door(true, 'door'); return; } // you can always get out
    if (!this.isNight()) { g.audio.thunk(0.5); g.say('Locked. Nobody answers. (Fight night is 21:00–04:00)'); return; }
    g.audio.thunk(0.6);
    if (!this.metDoorman) { this.metDoorman = true; g.say(`Doorman: "…Password? Ha, just kidding. You look like you can take a punch, ${g.profile?.name || 'JC'}. Get in."`, 5); }
    else g.say('Doorman: "Welcome back. Try not to bleed on the floor."', 3);
    this.door.target = 1; g.audio.door(true, 'door');
  }

  // ---------------- the cellar ----------------
  buildCellar() {
    const g = this.game, F = this.F, cx = CELLAR.x, cz = CELLAR.z;
    const rc = this.rc = new THREE.Vector3(cx, F, cz - 18);  // room centre (ring)
    const RW = 18, RD = 17, RH = 3.6;
    const z0 = cz - 9.2, z1 = z0 - RD;                       // room spans z0 (door side) .. z1
    const wallM = new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 0.95 });
    const floorM = mats.floor;
    const fm = box(g.scene, RW, 0.2, RD, floorM, cx, F - 0.1, (z0 + z1) / 2); fm.receiveShadow = true;
    addCollider(cx - RW / 2, F - 0.6, z1, cx + RW / 2, F, z0, { walkable: true, car: false });
    const W = (x, z, w, d) => { const m = box(g.scene, w, RH, d, wallM, x, F + RH / 2, z); m.receiveShadow = true; addCollider(x - w / 2, F, z - d / 2, x + w / 2, F + RH, z + d / 2); };
    W(cx, z1, RW, 0.3); W(cx - RW / 2, (z0 + z1) / 2, 0.3, RD); W(cx + RW / 2, (z0 + z1) / 2, 0.3, RD);
    W(cx - (RW / 2 + 0.8) / 2, z0, RW / 2 - 0.8, 0.3); W(cx + (RW / 2 + 0.8) / 2, z0, RW / 2 - 0.8, 0.3); // door wall with the doorway
    const ceil = box(g.scene, RW, 0.2, RD, wallM, cx, F + RH, (z0 + z1) / 2); ceil.castShadow = true;
    // the ring: canvas, posts, three ropes (ropes are colliders so the fight stays inside)
    const R = 3.2;
    const canvas = box(g.scene, R * 2 + 0.4, 0.05, R * 2 + 0.4, new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.9 }), rc.x, F + 0.03, rc.z); canvas.receiveShadow = true;
    const ropeM = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(g.scene, 0.07, 1.4, MAT.redPaint, rc.x + sx * R, F + 0.7, rc.z + sz * R, 'y', 8);
    for (const y of [0.45, 0.8, 1.15]) { box(g.scene, R * 2, 0.04, 0.04, ropeM, rc.x, F + y, rc.z - R); box(g.scene, R * 2, 0.04, 0.04, ropeM, rc.x, F + y, rc.z + R); box(g.scene, 0.04, 0.04, R * 2, ropeM, rc.x - R, F + y, rc.z); box(g.scene, 0.04, 0.04, R * 2, ropeM, rc.x + R, F + y, rc.z); }
    for (const [x, z, w, d] of [[rc.x, rc.z - R, R * 2, 0.1], [rc.x, rc.z + R, R * 2, 0.1], [rc.x - R, rc.z, 0.1, R * 2], [rc.x + R, rc.z, 0.1, R * 2]]) addCollider(x - w / 2, F, z - d / 2, x + w / 2, F + 1.4, z + d / 2);
    this.R = R;
    // lights: a hot lamp over the ring and dim bulbs around
    const ringLight = new THREE.SpotLight(0xfff0d0, 40, 12, 0.8, 0.5, 1.2); ringLight.position.set(rc.x, F + RH - 0.2, rc.z); ringLight.target.position.copy(rc); g.scene.add(ringLight, ringLight.target);
    cyl(g.scene, 0.25, 0.2, MAT.darkSteel, rc.x, F + RH - 0.15, rc.z, 'y', 12);
    for (const [x, z] of [[cx - 6, z0 - 3], [cx + 6, z0 - 3], [cx - 6, z1 + 3], [cx + 6, z1 + 3]]) { const l = new THREE.PointLight(0xffb070, 4, 9, 1.6); l.position.set(x, F + RH - 0.4, z); g.scene.add(l); }
    // benches, crates, a bar counter, posters
    for (const [x, z, w, d] of [[cx - 7.5, rc.z, 0.5, 6], [cx + 7.5, rc.z, 0.5, 6]]) box(g.scene, w, 0.45, d, MAT.wood, x, F + 0.22, z);
    for (let i = 0; i < 5; i++) box(g.scene, 0.6, 0.6, 0.6, MAT.wood, cx - 8 + (i % 2) * 0.7, F + 0.3 + Math.floor(i / 2) * 0.6 * (i < 4 ? 1 : 0), z1 + 1.2);
    const bar = box(g.scene, 3, 1.05, 0.6, MAT.wood, cx + 5.5, F + 0.52, z1 + 1.2); bar.userData.surface = true; addCollider(cx + 4, F, z1 + 0.9, cx + 7, F + 1.05, z1 + 1.5, { walkable: true });
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshStandardMaterial({ map: labelTex('THE CELLAR\nFIGHT NIGHT', 512, 180, '#1a0a0a', '#e0b030', 'bold 60px Impact') }));
    poster.position.set(cx, F + 2.4, z1 + 0.17); g.scene.add(poster);
    UNDERGROUND.push({ minX: cx - RW / 2 - 1, maxX: cx + RW / 2 + 1, minZ: z1 - 1, maxZ: z0 + 1, top: this.T - 0.6 });
    // people: bookie, ring master, crowd (only on fight nights)
    this.people = new THREE.Group(); g.scene.add(this.people);
    const rnd = mulberry32(99);
    const person = (shirt, pants, x, z, faceY) => { const m = personModel(shirt, pants, npcFace(rnd, Math.floor(rnd() * 7)), null); m.g.position.set(x, F, z); m.g.rotation.y = faceY; this.people.add(m.g); return m; };
    this.bookie = person(0x2a5a2a, 0x222222, cx - 5.5, z1 + 1.6, 0);
    this.master = person(0x111111, 0x111111, cx + 3.2, z0 - 2.2, Math.PI);
    const tag = (m, text) => m.g.traverse((o) => { if (o.isMesh) o.userData.interact = text; });
    tag(this.bookie, { prompt: () => `${K('E')}Talk to Veikko the bookie <span class="dim">(bet on fights)</span>`, use: (b) => b === 'E' && this.openBets() });
    tag(this.master, { prompt: () => `${K('E')}Talk to the ring master <span class="dim">(fight)</span>`, use: (b) => b === 'E' && this.openFight() });
    this.crowd = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, rr = R + 1.3 + (i % 2) * 0.6;
      const x = rc.x + Math.cos(a) * rr * 1.15, z = rc.z + Math.sin(a) * rr;
      if (Math.abs(x - this.master.g.position.x) < 1 && Math.abs(z - this.master.g.position.z) < 1) continue;
      const m = person([0x5a4a3a, 0x2a3a5a, 0x6a2a2a, 0x3a3a3a, 0x7a6a2a][i % 5], 0x2a2a2a, x, z, Math.atan2(rc.x - x, rc.z - z));
      m.ph = rnd() * 6; this.crowd.push(m);
    }
    this.z0 = z0; this.z1 = z1;
    this.pickRoots.push(this.people);
  }

  // ---------------- betting ----------------
  matchup() {
    if (!this.nextMatch) {
      const r = this.rnd, a = Math.floor(r() * FIGHTERS.length); let b = Math.floor(r() * FIGHTERS.length); if (b === a) b = (a + 1) % FIGHTERS.length;
      const sa = FIGHTERS[a].hp * FIGHTERS[a].dmg * (0.8 + r() * 0.4), sb = FIGHTERS[b].hp * FIGHTERS[b].dmg * (0.8 + r() * 0.4);
      const pa = sa / (sa + sb);
      this.nextMatch = { a, b, pa, oddsA: Math.max(1.1, Math.round((0.92 / pa) * 10) / 10), oddsB: Math.max(1.1, Math.round((0.92 / (1 - pa)) * 10) / 10) };
    }
    return this.nextMatch;
  }
  openBets() {
    const g = this.game, ui = g.ui;
    if (this.bet) { const bf = FIGHTERS[this.bet.side ? this.bet.m.b : this.bet.m.a]; g.say(`Veikko: "You've got ${this.bet.amt} mk on ${bf.name} in the next fight. Patience."`, 4); return; }
    const m = this.matchup(), A = FIGHTERS[m.a], B = FIGHTERS[m.b];
    const now = this.match ? `<div class="muted">In the ring now: ${this.match.a.f.name} vs ${this.match.b.f.name}</div>` : this.fight ? '<div class="muted">In the ring now: you!</div>' : '';
    ui.panel(`<h2>Veikko's book</h2>${now}<div>Next fight: <b>${A.name}</b> vs <b>${B.name}</b> <span class="muted">(bets are for the next fight)</span></div>
      <div class="muted">Odds: ${A.name.split(' ')[0]} pays ${m.oddsA}× · ${B.name.split(' ')[0]} pays ${m.oddsB}×. You have ${fmtMoney(g.money)}.</div>
      ${[A, B].map((F, i) => `<div class="svc"><span>Bet on <b>${F.name}</b> (${i ? m.oddsB : m.oddsA}×)</span><span>${[20, 50, 100, 250].map((v) => `<button class="small" data-b="${i}:${v}">${v} mk</button>`).join(' ')}</span></div>`).join('')}`, (el) => {
      el.querySelectorAll('[data-b]').forEach((btn) => btn.onclick = () => {
        const [side, amt] = btn.dataset.b.split(':').map(Number);
        if (g.money < amt) { ui.toast('Not enough money'); return; }
        g.addMoney(-amt, `Bet on ${(side ? B : A).name}`);
        this.bet = { side, amt, odds: side ? m.oddsB : m.oddsA, m };
        ui.closeModal();
        g.say(this.match || this.fight ? `Veikko: "${amt} mk on ${(side ? B : A).name}. It's the next fight — enjoy this one."` : `Veikko: "${amt} mk on ${(side ? B : A).name}. They're up next."`, 4);
      });
    });
  }
  startMatch() {
    const g = this.game, m = this.matchup(); this.nextMatch = null;
    const mk = (i, sx) => { const f = FIGHTERS[i]; const p = personModel(f.shirt, f.pants, npcFace(mulberry32(i * 17 + 3), i % 7), null); p.g.position.set(this.rc.x + sx * 1.6, this.F, this.rc.z); g.scene.add(p.g); return { ...this.newFighter(f), model: p, pos: p.g.position }; };
    const a = mk(m.a, -1), b = mk(m.b, 1);
    // bias the fight towards the odds a little (the favourite hits a bit harder)
    a.dmg *= 0.85 + m.pa * 0.3; b.dmg *= 0.85 + (1 - m.pa) * 0.3;
    this.match = { a, b, winner: null, t: 0, bet: this.bet && this.bet.m === m ? this.bet : null };
    if (this.match.bet) this.bet = null;
    if (g.player.pos.distanceTo(this.rc) < 25) { g.say(`Ring master: "Ladies and gentlemen… ${FIGHTERS[m.a].name}… versus… ${FIGHTERS[m.b].name}!"`, 4); g.audio.beep(true); }
  }
  newFighter(f) { return { f, hp: f.hp, maxHp: f.hp, dmg: f.dmg, speed: f.speed, wind: f.wind, blockP: f.block, cd: 1 + Math.random(), state: 'move', t: 0, arm: 0, blockT: 0, yaw: 0, ko: 0 }; }

  // ---------------- fighting ----------------
  openFight() {
    const g = this.game, ui = g.ui;
    if (this.fight) { g.say('Ring master: "You\'re already in there!"'); return; }
    if (this.queued) { g.say('Ring master: "You\'re on after this one. Warm up."'); return; }
    const i = Math.min(this.rank, FIGHTERS.length - 1), f = FIGHTERS[i];
    const champ = this.rank >= FIGHTERS.length;
    const prize = champ ? Math.round(f.prize * 0.6) : f.prize, fee = 30;
    ui.panel(`<h2>The ring master</h2>
      <div>${champ ? 'You beat them all. Rematch against <b>Iso-Jussi</b> for the crowd?' : `Next on the ladder (${i + 1}/${FIGHTERS.length}): <b>${f.name}</b>`}</div>
      <div class="muted">Entry ${fmtMoney(fee)} · Win ${fmtMoney(prize)} · ${f.hp} HP, hits ${f.dmg <= 8 ? 'soft' : f.dmg <= 11 ? 'hard' : 'very hard'}.</div>
      <div class="muted" style="margin-top:6px">${K('LMB')} punch (uses stamina) · hold ${K('RMB')} block · WASD move. Watch his arm pull back — that's your cue to block or step away.</div>
      <div class="svc"><span>${this.match ? 'Fight after the current match' : 'Step into the ring'}</span><button id="fgo">Fight! (${fmtMoney(fee)})</button></div>`, (el) => {
      el.querySelector('#fgo').onclick = () => {
        if (g.money < fee) { ui.toast('Not enough money for the entry fee'); return; }
        if (g.interaction.held) { ui.toast('Put down what you\'re holding first'); return; }
        g.addMoney(-fee, 'Fight entry fee'); ui.closeModal();
        if (this.match) { this.queued = { i, prize }; g.say('Ring master: "You\'re up after this fight. Don\'t wander off."', 4); }
        else this.startFight(i, prize);
      };
    });
  }
  startFight(i, prize) {
    const g = this.game, f = FIGHTERS[i];
    const p = personModel(f.shirt, f.pants, npcFace(mulberry32(i * 17 + 3), i % 7), null);
    p.g.position.set(this.rc.x, this.F, this.rc.z - 1.8); g.scene.add(p.g);
    const opp = { ...this.newFighter(f), model: p, pos: p.g.position };
    g.player.pos.set(this.rc.x, this.F, this.rc.z + 1.8); g.player.yaw = 0; g.player.pitch = -0.05; g.player.vel.set(0, 0, 0);
    this.fight = { opp, hp: 100, stam: 100, prize, idx: i, count: 3, punchT: 0, punchArm: 0, over: false };
    this.showHud(true); this.buildFists();
    g.say(`Ring master: "${f.name} versus ${g.profile?.name || 'JC'}! Three… two… one…"`, 3);
  }
  buildFists() {
    if (this.fists) { this.fists.visible = true; return; }
    const g = this.game;
    const skinHex = ['#f6d7c3', '#eac0a0', '#d9a77f', '#c28a62', '#9a6a45', '#714a2e', '#4e3220'][g.profile?.face?.skin ?? 1];
    const skin = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.7 });
    const wrap = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9 });
    this.fists = new THREE.Group(); g.camera.add(this.fists);
    this.fistArms = [-1, 1].map((s) => {
      const a = new THREE.Group(); this.fists.add(a);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), skin); fore.rotation.x = Math.PI / 2; fore.position.z = 0.18; a.add(fore);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.11), wrap); a.add(fist);
      a.userData.side = s; return a;
    });
    this.fists.traverse((o) => { if (o.isMesh) { o.renderOrder = 10; o.raycast = () => {}; } });
  }
  showHud(on) {
    let el = document.getElementById('fighthud');
    if (!el) { el = document.createElement('div'); el.id = 'fighthud'; document.body.appendChild(el); }
    el.classList.toggle('on', on);
    this.hudEl = el;
  }
  drawHud() {
    const F = this.fight; if (!F || !this.hudEl) return;
    const o = F.opp;
    this.hudEl.innerHTML = `<div class="fh-row"><div class="fh-n">${this.game.profile?.name || 'JC'}</div><div class="fh-bar"><div style="width:${clamp(F.hp, 0, 100)}%;background:#d83a2a"></div></div></div>
      <div class="fh-row"><div class="fh-n">Stamina</div><div class="fh-bar small"><div style="width:${clamp(F.stam, 0, 100)}%;background:#e8c040"></div></div></div>
      <div class="fh-row opp"><div class="fh-n">${o.f.name}</div><div class="fh-bar"><div style="width:${clamp(o.hp / o.maxHp * 100, 0, 100)}%;background:#d83a2a"></div></div></div>
      ${F.count > 0 ? `<div class="fh-count">${Math.ceil(F.count)}</div>` : ''}<div class="fh-help">LMB punch · hold RMB block · WASD move</div>`;
  }

  // an AI fighter vs a target position (player or another fighter)
  aiStep(a, target, dt, onHit) {
    const to = new THREE.Vector3(target.x - a.pos.x, 0, target.z - a.pos.z), d = to.length();
    a.yaw = Math.atan2(to.x, to.z);
    a.model.g.rotation.y = a.yaw;
    a.t -= dt; a.cd -= dt; a.blockT -= dt;
    const arms = a.model.arms;
    if (a.state === 'ko') { a.ko = Math.min(1, a.ko + dt * 2); a.model.g.rotation.x = -a.ko * 1.45; a.model.g.position.y = this.F + a.ko * 0.15; return; }
    if (a.state === 'stagger') { if (a.t <= 0) a.state = 'move'; a.pos.addScaledVector(to.normalize(), -dt * 0.8); this.keepIn(a.pos); return; }
    const guard = a.blockT > 0 ? -1.2 : -0.6;
    if (a.state === 'move') {
      if (d > 1.05) { a.pos.addScaledVector(to.clone().normalize(), Math.min(d - 1, a.speed * dt)); a.walk = (a.walk || 0) + dt * 8; }
      else if (d < 0.8) a.pos.addScaledVector(to.clone().normalize(), -dt * 0.6);
      this.keepIn(a.pos);
      arms.forEach((s) => { s.rotation.x += (guard - s.rotation.x) * Math.min(1, dt * 10); });
      if (a.model.legs) a.model.legs.forEach((l, i) => { l.rotation.x = Math.sin((a.walk || 0) + i * Math.PI) * 0.3; });
      if (d < 1.6 && a.cd <= 0) { a.state = 'windup'; a.t = a.wind; a.arm = Math.random() < 0.5 ? 0 : 1; }
    } else if (a.state === 'windup') {
      arms[a.arm].rotation.x += (0.7 - arms[a.arm].rotation.x) * Math.min(1, dt * 12); // pull back: the tell
      if (a.t <= 0) { a.state = 'strike'; a.t = 0.14; onHit(d); }
    } else if (a.state === 'strike') {
      arms[a.arm].rotation.x += (-1.6 - arms[a.arm].rotation.x) * Math.min(1, dt * 30);
      if (a.t <= 0) { a.state = 'move'; a.cd = a.f.cd * (0.7 + Math.random() * 0.6); }
    }
  }
  keepIn(p) { const r = this.R - 0.45; p.x = clamp(p.x, this.rc.x - r, this.rc.x + r); p.z = clamp(p.z, this.rc.z - r, this.rc.z + r); }
  // something lands on fighter a
  hitFighter(a, dmg) {
    if (a.state === 'ko') return;
    const blocked = a.blockT > 0;
    a.hp -= blocked ? dmg * 0.2 : dmg;
    if (!blocked && Math.random() < a.blockP) a.blockT = 0.9;     // learns to cover up
    if (!blocked && a.state === 'windup' && Math.random() < 0.6) { a.state = 'stagger'; a.t = 0.3; }
    if (a.hp <= 0) { a.state = 'ko'; a.hp = 0; }
    return blocked;
  }

  update(dt, input) {
    const g = this.game, night = this.isNight();
    this.people.visible = night; this.doorman.g.visible = night;
    // the crowd bounces when something is happening
    const hype = this.fight || this.match ? 1 : 0.3;
    for (const c of this.crowd) { c.ph += dt * (2 + hype * 4); c.arms.forEach((s, i) => { s.rotation.x = -0.4 - Math.max(0, Math.sin(c.ph + i)) * 2.2 * hype; }); }
    if (!night && this.door.target && Math.hypot(g.player.pos.x - CELLAR.x, g.player.pos.z - (CELLAR.z - 9.2)) > 6) this.door.target = 0; // doorman locks up at dawn
    if (this.match) this.updateMatch(dt);
    if (this.fight) this.updateFight(dt, input);
    // fight night: one match after another (and your fight, if you signed up, comes next)
    if (night && !this.match && !this.fight) {
      this.breakT = (this.breakT ?? 0) - dt;
      if (this.queued) {
        if (g.player.pos.distanceTo(this.rc) < 25 && !g.interaction.held) { const q = this.queued; this.queued = null; this.startFight(q.i, q.prize); }
        else if (this.breakT < -60) { this.queued = null; g.say('Ring master: "You missed your fight. No refunds."', 4); }
      } else if (this.breakT <= 0) this.startMatch();
    }
    if (!night && this.queued) this.queued = null;
  }
  updateMatch(dt) {
    const g = this.game, M = this.match;
    M.t += dt;
    if (M.winner === null) {
      this.aiStep(M.a, M.b.pos, dt, (d) => { if (d < 1.45) { this.hitFighter(M.b, M.a.dmg * (0.7 + Math.random() * 0.6)); g.audio.thunk(0.7); } });
      this.aiStep(M.b, M.a.pos, dt, (d) => { if (d < 1.45) { this.hitFighter(M.a, M.b.dmg * (0.7 + Math.random() * 0.6)); g.audio.thunk(0.7); } });
      if (M.a.state === 'ko' || M.b.state === 'ko') {
        M.winner = M.a.state === 'ko' ? 1 : 0; M.endT = 4;
        const w = M.winner ? M.b : M.a;
        if (this.game.player.pos.distanceTo(this.rc) < 25) { g.say(`KNOCKOUT! ${w.f.name} wins!`, 4); g.audio.crash(10); }
        const near = this.game.player.pos.distanceTo(this.rc) < 25;
        if (M.bet) {
          if (M.bet.side === M.winner) { const pay = Math.round(M.bet.amt * M.bet.odds); g.addMoney(pay, 'Bet won at The Cellar'); g.life.cheer(8); g.ach?.unlock('bet_win'); }
          else { g.say('Your fighter lost. Veikko pockets your money with a grin.', 4); g.life.cheer(-3, true); }
        } else if (!near) M.quiet = true;
      }
    } else {
      this.aiStep(M.a, M.b.pos, dt, () => {}); this.aiStep(M.b, M.a.pos, dt, () => {});
      M.endT -= dt;
      if (M.endT <= 0) { g.scene.remove(M.a.model.g, M.b.model.g); this.match = null; this.breakT = 18; }
    }
  }
  updateFight(dt, input) {
    const g = this.game, F = this.fight, o = F.opp, P = g.player;
    P.pos.x = clamp(P.pos.x, this.rc.x - this.R + 0.4, this.rc.x + this.R - 0.4); P.pos.z = clamp(P.pos.z, this.rc.z - this.R + 0.4, this.rc.z + this.R - 0.4);
    const blocking = input.mouse.r && !F.over;
    // fists on screen
    F.punchT = Math.max(0, F.punchT - dt);
    this.fistArms.forEach((a, i) => {
      const s = a.userData.side, punching = F.punchT > 0 && F.punchArm === i, ext = punching ? Math.sin((1 - F.punchT / 0.22) * Math.PI) : 0;
      const bob = Math.sin(performance.now() * 0.006 + i) * 0.01;
      const tx = blocking ? s * 0.09 : s * 0.2 - s * ext * 0.12, ty = blocking ? -0.06 : -0.2 + bob + ext * 0.08, tz = blocking ? -0.32 : -0.42 - ext * 0.4;
      a.position.x += (tx - a.position.x) * Math.min(1, dt * 18); a.position.y += (ty - a.position.y) * Math.min(1, dt * 18); a.position.z += (tz - a.position.z) * Math.min(1, dt * 22);
      a.rotation.set(blocking ? -0.2 : 0.1, 0, s * (blocking ? 0.9 : 0.25));
    });
    F.stam = clamp(F.stam + dt * (blocking ? 6 : 13), 0, 100);
    F.cool = Math.max(0, (F.cool || 0) - dt);
    if (F.count > 0) { F.count -= dt; if (F.count <= 0) { g.say('FIGHT!', 1); g.audio.beep(true); } this.drawHud(); return; }
    if (!F.over) {
      // your punches
      if (input.mouse.lDown && !blocking && F.stam >= 14 && F.cool <= 0) {
        F.punchT = 0.22; F.cool = 0.45; F.punchArm = 1 - F.punchArm; F.stam -= 14;
        const to = new THREE.Vector3(o.pos.x - P.pos.x, 0, o.pos.z - P.pos.z), d = to.length();
        const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
        if (d < 1.5 && fwd.dot(to.normalize()) > 0.75 && o.state !== 'ko') {
          const blocked = this.hitFighter(o, 5 + Math.random() * 4 + (F.stam > 50 ? 1 : 0));
          g.audio.thunk(blocked ? 0.3 : 0.9);
          if (!blocked) g.audio.burst(300, 1, 0.2, 0.08);
        } else g.audio.burst(1500, 1, 0.04, 0.1); // whiff
      }
      // his punches
      this.aiStep(o, P.pos, dt, (d) => {
        const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), to = new THREE.Vector3(o.pos.x - P.pos.x, 0, o.pos.z - P.pos.z).normalize();
        if (d > 1.5) { g.audio.burst(1500, 1, 0.04, 0.1); return; }
        const covered = blocking && fwd.dot(to) > 0.5;
        const dmg = o.dmg * (0.75 + Math.random() * 0.5) * (covered ? 0.15 : 1);
        F.hp -= dmg; if (covered) F.stam -= 15;
        g.audio.thunk(covered ? 0.4 : 1);
        if (!covered) { this.flash(); P.yaw += (Math.random() - 0.5) * 0.12; P.pitch += 0.06; }
      });
      if (o.state === 'ko') this.endFight(true);
      else if (F.hp <= 0) this.endFight(false);
    } else {
      this.aiStep(o, P.pos, dt, () => {});
      F.endT -= dt;
      if (F.endT <= 0) this.cleanupFight();
    }
    this.drawHud();
  }
  flash() {
    let el = document.getElementById('hitflash');
    if (!el) { el = document.createElement('div'); el.id = 'hitflash'; document.body.appendChild(el); }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  endFight(won) {
    const g = this.game, F = this.fight;
    F.over = true; F.won = won; F.endT = won ? 3 : 0.5;
    if (won) {
      g.audio.crash(10);
      g.addMoney(F.prize, `Won a fight at The Cellar vs ${F.opp.f.name}`);
      g.life.cheer(15); this.wins++;
      if (this.rank === F.idx) this.rank++;
      g.ach?.unlock('fight_win'); if (this.rank >= FIGHTERS.length) g.ach?.unlock('fight_champ');
      g.say(this.rank >= FIGHTERS.length && F.idx === FIGHTERS.length - 1 ? 'KNOCKOUT! You beat Iso-Jussi — you\'re the king of The Cellar!' : `KNOCKOUT! ${F.opp.f.name} is down. The crowd goes wild!`, 5);
    } else {
      g.fade(() => {
        this.cleanupFight();
        g.player.pos.set(CELLAR.x + 5, this.F, this.z1 + 2.5);
        g.life.skip(45); g.life.cheer(-10, true); g.life.fatigue = Math.min(100, g.life.fatigue + 20);
        g.say(`You got knocked out by ${F.opp.f.name}. You come round on the bench with a ringing head.`, 5);
      });
    }
  }
  cleanupFight() {
    const g = this.game, F = this.fight; if (!F) return;
    g.scene.remove(F.opp.model.g);
    if (F.won) g.player.pos.set(this.rc.x, this.F, this.rc.z + this.R + 1.2); // climb out of the ring
    this.fight = null; this.showHud(false); if (this.fists) this.fists.visible = false;
  }
  serialize() { return { rank: this.rank, wins: this.wins, met: this.metDoorman }; } // (bets & queued fights don't survive a save)
  restore(d) { if (!d) return; this.rank = d.rank || 0; this.wins = d.wins || 0; this.metDoorman = !!d.met; }
}
