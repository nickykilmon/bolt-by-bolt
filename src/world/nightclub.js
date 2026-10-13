// Klubi Revontuli — Ruskala's nightclub. Pay the bouncer, get drinks and smokes at the bar, dance,
// or take the DJ job: give the crowd what they want or someone asks you to "meet them outside".
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { ZONES } from './terrain.js';
import { addCollider } from './colliders.js';
import { labelTex } from '../core/textures.js';
import { personModel, npcFace } from './npc.js';
import { mulberry32, clamp, fmtMoney } from '../core/util.js';

const K = (k) => `<span class="k">${k}</span>`;
const X0 = 513, X1 = 525, Z0 = 125, Z1 = 139, H = 4.6, DOOR_Z0 = 130.6, DOOR_Z1 = 133.4;
const COVER = 40;
const ENERGY = [
  { name: 'chill', style: 'Lounge', lo: 94, hi: 104, shout: ['Something chill…', 'Slow it down a bit!', 'Give us something smooth!'] },
  { name: 'groove', style: 'House', lo: 114, hi: 121, shout: ['Give us a groove!', 'Something we can dance to!', 'House music!'] },
  { name: 'peak', style: 'Techno', lo: 124, hi: 130, shout: ['MORE ENERGY!', 'Faster!', 'Turn it up!'] },
  { name: 'hard', style: 'Hardstyle', lo: 138, hi: 148, shout: ['HARDER!!', 'Make it pound!', 'BANGERS ONLY!'] },
];
const NAMES = { chill: ['Midnight Sauna', 'Lake Glow', 'Soft Snow', 'Northern Drift'], groove: ['Ruskala Nights', 'Funky Moose', 'Sauna Disco', 'Velvet Gravel'], peak: ['Turbo Boost', 'Rev Limiter', 'Iron Rally', 'Night Stage'], hard: ['Jäänsärkijä', 'Iso-Jussi Anthem', 'Hammer Down', 'Full Throttle'] };
const DRINKS = [
  { id: 'beer', name: 'Beer', price: 12 }, { id: 'lonkero', name: 'Lonkero', price: 12 }, { id: 'shot_kossu', name: 'Koskenkorva shot', price: 8 },
  { id: 'cocktail', name: '"Revontuli" cocktail', price: 18 }, { id: 'energy_drink', name: 'Energy drink', price: 14 }, { id: 'water_bottle', name: 'Water', price: 5 }, { id: 'cigarettes', name: 'Cigarettes (20)', price: 25 },
];

// ---------------- procedural club music ----------------
class ClubMusic {
  constructor(game, pos) { this.game = game; this.pos = pos; this.track = null; this.next = 0; this.step = 0; }
  ensure() {
    const a = this.game.audio, ctx = a.ctx; if (!ctx || this.out) return !!this.out;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
    this.pan = ctx.createPanner(); this.pan.panningModel = 'equalpower'; this.pan.distanceModel = 'inverse'; this.pan.refDistance = 6; this.pan.rolloffFactor = 1.2;
    this.pan.positionX.value = this.pos.x; this.pan.positionY.value = this.pos.y; this.pan.positionZ.value = this.pos.z;
    this.out.connect(this.muffle); this.muffle.connect(this.pan); this.pan.connect(a.master);
    this.noise = a.noiseBuf;
    return true;
  }
  play(track, clean = true) {
    const ctx = this.game.audio.ctx; if (!this.ensure()) { this.track = track; return; }
    if (!clean) { // trainwreck: record scratch + a beat of silence
      const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(3000, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.4);
      const gn = ctx.createGain(); gn.gain.setValueAtTime(0.5, ctx.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      s.connect(f); f.connect(gn); gn.connect(this.out); s.start(); s.stop(ctx.currentTime + 0.5);
    }
    this.track = track; this.step = 0; this.next = ctx.currentTime + (clean ? 0.05 : 0.6); this.t0 = this.next;
  }
  beatPhase() { const ctx = this.game.audio.ctx; if (!ctx || !this.track) return 0; const b = (ctx.currentTime - this.t0) * this.track.bpm / 60; return b - Math.floor(b); }
  update(level, muffled) {
    const ctx = this.game.audio.ctx; if (!ctx || !this.track || !this.ensure()) return;
    this.out.gain.setTargetAtTime(level, ctx.currentTime, 0.2);
    this.muffle.frequency.setTargetAtTime(muffled ? 380 : 20000, ctx.currentTime, 0.15);
    if (level < 0.01) { this.next = ctx.currentTime + 0.1; return; }
    const T = this.track, sd = 60 / T.bpm / 4;
    while (this.next < ctx.currentTime + 0.2) { this.playStep(this.step, this.next, T); this.step++; this.next += sd; }
  }
  env(t, peak, dec) { const g = this.game.audio.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dec); g.connect(this.out); return g; }
  playStep(n, t, T) {
    const ctx = this.game.audio.ctx, s16 = n % 16, e = T.energy;
    const kickOn = e === 0 ? s16 % 8 === 0 : e === 3 ? s16 % 4 === 0 || s16 === 14 : s16 % 4 === 0;
    if (kickOn) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(e === 3 ? 180 : 140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); o.connect(this.env(t, e === 3 ? 0.9 : 0.7, 0.28)); o.start(t); o.stop(t + 0.3); }
    if ((e >= 1 && (s16 === 4 || s16 === 12)) || (e === 0 && s16 === 8)) { const b = ctx.createBufferSource(); b.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; b.connect(f); f.connect(this.env(t, 0.25, 0.14)); b.start(t); b.stop(t + 0.16); }
    if ((e === 0 ? s16 % 4 === 2 : s16 % 2 === 1 || (e >= 2 && s16 % 2 === 0 && s16 % 4 !== 0))) { const b = ctx.createBufferSource(); b.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500; b.connect(f); f.connect(this.env(t, e >= 2 ? 0.12 : 0.07, 0.05)); b.start(t); b.stop(t + 0.06); }
    // bass on the off-beats, following a little progression
    const prog = [0, 0, 5, 3][Math.floor(n / 64) % 4];
    if (s16 % 4 === 2 || (e >= 2 && s16 % 4 === 3)) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (T.root + prog - 69 - 24) / 12); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300 + e * 180; o.connect(f); f.connect(this.env(t, 0.28, 0.18)); o.start(t); o.stop(t + 0.2); }
    // chord stabs / pads
    if ((e >= 2 && (s16 === 6 || s16 === 14)) || (e < 2 && s16 === 0)) {
      for (const iv of [0, 3, 7]) { const o = ctx.createOscillator(); o.type = e >= 2 ? 'square' : 'triangle'; o.frequency.value = 440 * Math.pow(2, (T.root + prog + iv - 69 + 12) / 12); o.connect(this.env(t, e >= 2 ? 0.04 : 0.05, e >= 2 ? 0.12 : 0.9)); o.start(t); o.stop(t + 1); }
    }
  }
}

export class Nightclub {
  constructor(game) {
    this.game = game;
    this.T = ZONES.find((z) => z.id === 'town').h;
    this.rnd = mulberry32(2024);
    this.root = new THREE.Group(); game.scene.add(this.root);
    this.build();
    this.music = new ClubMusic(game, new THREE.Vector3(516, this.T + 2, 132));
    this.music.play(this.randomTrack());
    this.dancing = false; this.dj = null; this.heckler = null;
    this.paidNight = -1; this.djNight = -1;
    game.clubPos = new THREE.Vector3(519, this.T, 132);
  }
  isOpen() { const h = this.game.life.hours; return h >= 21 || h < 4; }
  nightKey() { const L = this.game.life; return L.hours < 12 ? L.day - 1 : L.day; }
  inside(p = this.game.player.pos) { return p.x > X0 && p.x < X1 && p.z > Z0 && p.z < Z1; }
  randomTrack(e = Math.floor(this.rnd() * 4)) { const E = ENERGY[e], names = NAMES[E.name]; return { name: names[Math.floor(this.rnd() * names.length)], energy: e, style: E.style, bpm: Math.round(E.lo + this.rnd() * (E.hi - E.lo)), root: 45 + Math.floor(this.rnd() * 7) }; }

  // ---------------- the building ----------------
  build() {
    const g = this.game, T = this.T, R = this.root;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.9 });
    const wall = (x0, z0, x1, z1) => { const m = box(R, x1 - x0, H, z1 - z0, wallM, (x0 + x1) / 2, T + H / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; addCollider(x0, T, z0, x1, T + H, z1); };
    wall(X0 - 0.2, Z0, X0, Z1); wall(X0, Z0 - 0.2, X1, Z0); wall(X0, Z1, X1, Z1 + 0.2);
    wall(X1, Z0, X1 + 0.2, DOOR_Z0); wall(X1, DOOR_Z1, X1 + 0.2, Z1);
    box(R, 0.2, H - 2.6, DOOR_Z1 - DOOR_Z0, wallM, X1 + 0.1, T + 2.6 + (H - 2.6) / 2, (DOOR_Z0 + DOOR_Z1) / 2);
    const roof = box(R, X1 - X0 + 0.6, 0.3, Z1 - Z0 + 0.6, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }), (X0 + X1) / 2, T + H + 0.15, (Z0 + Z1) / 2); roof.castShadow = true;
    const floor = box(R, X1 - X0, 0.04, Z1 - Z0, new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.4 }), (X0 + X1) / 2, T + 0.02, (Z0 + Z1) / 2); floor.receiveShadow = true;
    // neon sign over the door
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), new THREE.MeshBasicMaterial({ map: labelTex('KLUBI REVONTULI', 512, 110, '#0a0014', '#ff3cc8', 'bold 64px Impact'), toneMapped: false }));
    neon.position.set(X1 + 0.13, T + 3.4, (DOOR_Z0 + DOOR_Z1) / 2); neon.rotation.y = Math.PI / 2; R.add(neon);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.35), new THREE.MeshBasicMaterial({ map: labelTex(`NIGHTCLUB · 21–04 · ${COVER} mk`, 512, 82, '#0a0014', '#40e0ff', 'bold 40px Arial'), toneMapped: false }));
    sm.position.set(X1 + 0.13, T + 2.85, (DOOR_Z0 + DOOR_Z1) / 2); sm.rotation.y = Math.PI / 2; R.add(sm);
    // the bouncer's rope: a collider in the doorway until you've paid
    this.gate = addCollider(X1 - 0.1, T, DOOR_Z0, X1 + 0.4, T + 2.6, DOOR_Z1);
    for (const z of [DOOR_Z0 + 0.1, DOOR_Z1 - 0.1]) cyl(R, 0.04, 1, MAT.brass, X1 + 0.5, T + 0.5, z, 'y', 8);
    this.rope = box(R, 0.04, 0.04, DOOR_Z1 - DOOR_Z0 - 0.2, new THREE.MeshStandardMaterial({ color: 0xa01020 }), X1 + 0.5, T + 0.9, (DOOR_Z0 + DOOR_Z1) / 2);
    // dance floor: 3x3 light-up tiles
    this.tiles = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const m = new THREE.MeshBasicMaterial({ color: 0x220022 }); const t = box(R, 1.9, 0.03, 1.9, m, 517.5 + i * 2, T + 0.05, 130 + j * 2); t.userData.interact = { prompt: () => this.dancePrompt(), use: (b) => b === 'E' && this.toggleDance() }; this.tiles.push(m); }
    // DJ booth on the back wall
    const booth = box(R, 1.0, 1.05, 2.6, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 }), 514.6, T + 0.52, 132);
    for (const z of [131.3, 132.7]) { const d = cyl(R, 0.22, 0.04, MAT.darkSteel, 514.6, T + 1.07, z, 'y', 20); d.userData.spin = true; }
    box(R, 0.45, 0.05, 0.4, MAT.darkSteel, 514.6, T + 1.07, 132);
    this.djSpot = new THREE.Vector3(513.7, T, 132);
    booth.userData.interact = { prompt: () => this.boothPrompt(), use: (b) => b === 'E' && this.boothUse() };
    // podiums with dancers
    this.dancers = [];
    for (const z of [127.3, 136.7]) { cyl(R, 0.55, 0.7, new THREE.MeshStandardMaterial({ color: 0x401060, emissive: 0x200030 }), 514.6, T + 0.35, z, 'y', 16); this.dancers.push(this.person([0xff3cc8, 0x40e0ff][this.dancers.length], 0x111111, 514.6, T + 0.7, z, Math.PI / 2)); }
    // bar on the south wall, bottles on shelves
    const bar = box(R, 7, 1.1, 0.7, new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.5 }), 520.5, T + 0.55, 126.4); addCollider(517, T, 126.05, 524, T + 1.1, 126.75);
    bar.userData.interact = { prompt: () => `${K('E')}Order at the bar <span class="dim">(drinks & cigarettes)</span>`, use: (b) => b === 'E' && this.openBar() };
    box(R, 7, 0.05, 0.3, MAT.wood, 520.5, T + 1.8, 125.25);
    for (let i = 0; i < 18; i++) cyl(R, 0.04, 0.3, new THREE.MeshStandardMaterial({ color: [0x2a6a2a, 0x8a5a1a, 0xd8d8e0, 0x6a1a1a][i % 4], roughness: 0.1, transparent: true, opacity: 0.8 }), 517.4 + i * 0.36, T + 1.98, 125.25, 'y', 8);
    this.bartender = this.person(0x111111, 0x111111, 521, T, 125.55, 0);
    this.bartender.g.traverse((o) => { if (o.isMesh) o.userData.interact = bar.userData.interact; });
    // manager by the booth (hires DJs)
    this.manager = this.person(0x5a1a1a, 0x1a1a1a, 515.6, T, 128.9, Math.PI / 2);
    this.manager.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => `${K('E')}Talk to Riku, the club manager <span class="dim">(DJ job)</span>`, use: (b) => b === 'E' && this.offerDJ() }; });
    // bouncer outside
    this.bouncer = this.person(0x111111, 0x111111, X1 + 1.1, T, DOOR_Z0 - 0.5, Math.PI / 2);
    this.bouncer.g.scale.setScalar(1.12);
    this.bouncer.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => `${K('E')}Talk to the bouncer`, use: (b) => b === 'E' && this.talkBouncer() }; });
    // the crowd
    this.crowd = [];
    for (let i = 0; i < 16; i++) {
      const x = 516.8 + this.rnd() * 5.4, z = 129.3 + this.rnd() * 5.4;
      const p = this.person([0xff3cc8, 0x40e0ff, 0xf0e020, 0xffffff, 0x8a2be2, 0xff6020, 0x20c060][i % 7], [0x111111, 0x2a2a6a, 0x3a3a3a][i % 3], x, T, z, this.rnd() * 6.28);
      p.ph = this.rnd() * 6; p.home = new THREE.Vector3(x, T, z); this.crowd.push(p);
    }
    // lights: coloured spots that sweep, a mirror ball
    this.lights = [0xff2090, 0x20c0ff, 0x80ff40].map((c, i) => { const l = new THREE.PointLight(c, 8, 10, 1.5); l.position.set(519.5, T + 3.6, 132); R.add(l); return l; });
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.15, flatShading: true, envMapIntensity: 2 }));
    this.ball.position.set(519.5, T + 3.9, 133); R.add(this.ball);
  }
  person(shirt, pants, x, y, z, ry) {
    if (!this.people) { this.people = new THREE.Group(); this.root.add(this.people); }
    const m = personModel(shirt, pants, npcFace(this.rnd, Math.floor(this.rnd() * 7)), null);
    m.g.position.set(x, y, z); m.g.rotation.y = ry; this.people.add(m.g); return m;
  }

  // ---------------- door & bar ----------------
  talkBouncer() {
    const g = this.game;
    if (!this.isOpen()) { g.say('Bouncer: "Closed. Doors open at 21:00."'); return; }
    if (this.paidNight === this.nightKey()) { g.say('Bouncer: "You\'re on the list. In you go."'); return; }
    if (g.life.drunk > 1.6) { g.say('Bouncer: "Not tonight, pal. You can barely stand."'); return; }
    g.ui.dialog('Bouncer', `Cover charge is ${COVER} mk. No fighting, no puking on the dance floor.`, [
      { label: `Pay ${COVER} mk`, go: () => { if (g.money < COVER) { g.toast('Not enough money'); return; } g.addMoney(-COVER, 'Nightclub cover charge'); this.paidNight = this.nightKey(); g.say('Bouncer: "Enjoy your night."', 2); g.ach?.unlock('clubbing'); } },
      { label: 'Never mind', go: () => {} },
    ]);
  }
  openBar() {
    const g = this.game, ui = g.ui;
    if (!this.isOpen()) { g.say('The bar is closed.'); return; }
    ui.panel(`<h2>The bar</h2><div class="muted">You have ${fmtMoney(g.money)}. Drinks go straight into your hand${g.interaction.held ? ' — put down what you\'re holding first' : ''}.</div>
      ${DRINKS.map((d, i) => `<div class="svc"><span>${d.name}</span><span>${fmtMoney(d.price)} <button data-d="${i}">Buy</button></span></div>`).join('')}`, (el) => {
      el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => {
        const d = DRINKS[+b.dataset.d];
        if (g.money < d.price) { ui.toast('Not enough money'); return; }
        if (g.interaction.held) { ui.toast('Your hands are full'); return; }
        g.addMoney(-d.price, `${d.name} at the club`);
        g.interaction.hold(g.asm.create(d.id));
        ui.closeModal();
      });
    });
  }
  dancePrompt() { return this.dancing ? `${K('E')}Stop dancing` : `${K('E')}Dance <span class="dim">(or J anywhere)</span>`; }
  toggleDance() {
    const g = this.game;
    if (this.dancing) { this.dancing = false; return; }
    if (g.player.inCar || g.player.onMoped || g.fightclub?.fight || this.dj) return;
    this.dancing = true; this.danceT = 0;
    const club = this.inside() && this.isOpen();
    g.say(club ? 'You hit the dance floor! (J or move to stop)' : this.music.track && this.isOpen() && g.player.pos.distanceTo(this.djSpot) < 40 ? 'Dancing to the muffled club beat outside. (J or move to stop)' : ['Dancing like nobody’s watching. (J or move to stop)', 'Busting out some moves. (J or move to stop)', 'Dancing to the music in your head. (J or move to stop)'][Math.floor(Math.random() * 3)], 2);
    g.ach?.unlock('dance');
  }

  // ---------------- DJ job ----------------
  offerDJ() {
    const g = this.game;
    if (!this.isOpen()) { g.say('Riku: "Come back when we\'re open. 21:00."'); return; }
    if (this.djNight === this.nightKey()) { g.say('Riku: "You\'ve done your set tonight. Come back tomorrow."'); return; }
    if (this.dj) { g.say('Riku: "Get back on those decks!"'); return; }
    g.ui.dialog('Riku (club manager)', 'Our DJ didn\'t show. Play a set: read the crowd — they\'ll shout what they want — pick the right tracks and drop them on the beat. Pay depends on the vibe. Play rubbish and… well. People get upset.', [
      { label: 'Get on the decks', go: () => this.startDJ() },
      { label: 'Not tonight', go: () => {} },
    ]);
  }
  boothPrompt() { return this.dj ? `${K('E')}Leave the decks (ends your set)` : 'DJ booth <span class="dim">(talk to Riku for the DJ job)</span>'; }
  boothUse() { if (this.dj) this.endDJ(true); }
  startDJ() {
    const g = this.game;
    this.djNight = this.nightKey();
    const demand = 1 + Math.floor(this.rnd() * 2);
    this.dj = { vibe: 55, sum: 0, n: 0, tracks: 0, total: 6, demand, shoutT: 0, left: 30, options: null, cued: -1, msg: 'Pick your next track (1, 2 or 3), then press SPACE on the beat to drop it.' };
    this.music.play(this.randomTrack(demand), true);
    this.dj.cur = this.music.track;
    this.newOptions();
    g.player.pos.copy(this.djSpot); g.player.yaw = -Math.PI / 2; g.player.pitch = -0.1;
    this.showHud(true);
    g.say('You\'re on! Watch the vibe meter and listen to the crowd.', 3);
  }
  newOptions() {
    const d = this.dj, e = d.demand, pool = [e, (e + 1 + Math.floor(this.rnd() * 3)) % 4, (e + 2 + Math.floor(this.rnd() * 2)) % 4];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    d.options = pool.map((x) => this.randomTrack(x)); d.cued = -1;
  }
  updateDJ(dt, input) {
    const g = this.game, d = this.dj;
    g.player.pos.copy(this.djSpot);
    // the crowd wants what it wants
    const diff = Math.abs(d.cur.energy - d.demand);
    d.vibe = clamp(d.vibe + dt * (diff === 0 ? 3.5 : diff === 1 ? -1 : -3.5 * diff), 0, 100);
    d.sum += d.vibe * dt; d.n += dt;
    d.left -= dt;
    d.shoutT -= dt;
    if (d.shoutT <= 0) { d.shoutT = 6 + this.rnd() * 4; d.shout = ENERGY[d.demand].shout[Math.floor(this.rnd() * 3)]; if (diff > 0) g.audio.burst(900, 0.6, 0.05, 0.4); }
    for (const [k, i] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]) if (input.hit(k)) { d.cued = i; g.audio.click(0.4); d.msg = `Cued: ${d.options[i].name}. Press SPACE on the beat to drop it.`; }
    if (input.hit('Space') && d.cued >= 0) {
      const ph = this.music.beatPhase(), err = Math.min(ph, 1 - ph), clean = err < 0.14;
      const tr = d.options[d.cued];
      this.music.play(tr, clean); d.cur = tr; d.left = 30; d.tracks++;
      d.vibe = clamp(d.vibe + (clean ? 8 : -15), 0, 100);
      d.msg = clean ? '✔ Clean mix! The crowd loves it.' : '✖ TRAINWRECK! The beats clashed — drop exactly on the flash.';
      if (this.rnd() < 0.6) { const nd = clamp(d.demand + (this.rnd() < 0.5 ? -1 : 1), 0, 3); if (nd !== d.demand) { d.demand = nd; d.shoutT = 0; } }
      this.newOptions();
      if (d.tracks >= d.total) { this.endDJ(false); return; }
    }
    if (d.left <= 0) { // dead air
      d.vibe = clamp(d.vibe - 20, 0, 100); d.msg = '✖ The track ran out — dead air! Get the next one in sooner.';
      const tr = this.randomTrack(Math.floor(this.rnd() * 4)); this.music.play(tr, false); d.cur = tr; d.left = 30; d.tracks++; this.newOptions();
      if (d.tracks >= d.total) { this.endDJ(false); return; }
    }
    this.drawHud();
  }
  endDJ(quit) {
    const g = this.game, d = this.dj; if (!d) return;
    const avg = d.n > 0 ? d.sum / d.n : 0;
    this.dj = null; this.showHud(false);
    g.player.pos.set(515.6, this.T, 131); g.player.yaw = -Math.PI / 2;
    if (quit && d.tracks < 2) { g.say('Riku: "Walking out after one track? Nothing for you."', 4); return; }
    const pay = Math.round((60 + avg * 3.2) * (quit ? 0.5 : 1));
    if (avg >= 40) {
      g.addMoney(pay, `DJ set at Klubi Revontuli (vibe ${Math.round(avg)}%)`); g.life.cheer(12); g.ach?.unlock('dj');
      g.say(`Riku: "${avg > 75 ? 'That was HUGE. You\'re a natural!' : 'Not bad at all. The floor was moving.'}" (${pay} mk)`, 5);
    } else {
      const half = Math.round(pay * 0.5); g.addMoney(half, `DJ set at Klubi Revontuli (vibe ${Math.round(avg)}%)`); g.life.cheer(-5, true);
      g.say(`Riku: "…Here's ${half} mk. Please don't come back to the decks."`, 4);
      setTimeout(() => { g.say('Angry clubber: "You call THAT music?! Meet me outside. NOW."', 5); this.spawnHeckler(); }, 2500);
    }
  }
  spawnHeckler() {
    const T = this.T;
    const h = personModel(0x6a2a1a, 0x2a2a2a, npcFace(mulberry32(666), 4), null); h.g.scale.setScalar(1.08);
    h.g.position.set(X1 + 3.5, T, 132); h.g.rotation.y = -Math.PI / 2; this.root.add(h.g);
    h.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => `${K('E')}"Let's do this." <span class="dim">(fight the angry clubber)</span>`, use: (b) => b === 'E' && this.startStreetFight() }; });
    this.heckler = h;
  }
  startStreetFight() {
    const g = this.game, FC = g.fightclub;
    if (!this.heckler || FC.fight) return;
    if (g.interaction.held) { g.say('Put down what you\'re holding first (G).'); return; }
    this.root.remove(this.heckler.g); this.heckler = null;
    FC.startStreetFight({
      center: new THREE.Vector3(X1 + 4.5, this.T, 132), R: 3.6,
      fighter: { name: 'Angry clubber Kimmo', hp: 90, dmg: 9, speed: 1.6, wind: 0.5, block: 0.2, cd: 1.3, prize: 0, shirt: 0x6a2a1a, pants: 0x2a2a2a },
      onWin: () => { g.say('Kimmo staggers off into the night. The bouncer nods at you approvingly.', 5); g.ach?.unlock('dj_fight'); setTimeout(() => FC.cleanupFight(), 3000); },
      onLose: () => { g.player.pos.set(X1 + 2, this.T, 129); g.life.skip(30); g.life.cheer(-8, true); const lost = Math.min(60, Math.max(0, Math.round(g.money))); if (lost) g.addMoney(-lost, 'Lost your wallet cash in a street fight'); g.say(`You wake up on the pavement outside the club.${lost ? ` ${lost} mk is missing from your pocket.` : ''}`, 6); },
    });
  }
  showHud(on) {
    let el = document.getElementById('djhud');
    if (!el) { el = document.createElement('div'); el.id = 'djhud'; document.body.appendChild(el); }
    el.classList.toggle('on', on); this.hudEl = el;
  }
  drawHud() {
    const d = this.dj; if (!d || !this.hudEl) return;
    const flash = this.music.beatPhase() < 0.15;
    const vcol = d.vibe > 66 ? '#5ce05c' : d.vibe > 35 ? '#f2c14e' : '#ff5040';
    this.hudEl.innerHTML = `<div class="dj-top"><div class="dj-vibe"><span>CROWD VIBE</span><div class="dj-bar"><div style="width:${d.vibe}%;background:${vcol}"></div></div></div>
      <div class="dj-beat ${flash ? 'on' : ''}">● BEAT</div></div>
      <div class="dj-shout">🗣 "${d.shout || '…'}"</div>
      <div class="dj-now">NOW: <b>${d.cur.name}</b> · ${d.cur.style} · ${d.cur.bpm} BPM <div class="dj-bar small"><div style="width:${clamp(d.left / 30 * 100, 0, 100)}%;background:${d.left < 10 ? '#ff5040' : '#40e0ff'}"></div></div></div>
      <div class="dj-opts">${d.options.map((o, i) => `<div class="dj-opt ${d.cued === i ? 'cued' : ''}"><b>${i + 1}</b> ${o.name}<br><span>${o.style} · ${o.bpm} BPM</span></div>`).join('')}</div>
      <div class="dj-msg">${d.msg}</div><div class="dj-help">1/2/3 cue · SPACE drop on the beat · track ${Math.min(d.tracks + 1, d.total)}/${d.total} · E at the booth to quit</div>`;
  }

  // ---------------- per frame ----------------
  update(dt, input) {
    const g = this.game, open = this.isOpen(), P = g.player.pos;
    this.people.visible = open || !!this.dj; if (!open) this.lights.forEach((l) => { l.intensity = 0; });
    this.bouncer.g.visible = true;
    // the rope: open for paying guests at night, and always from the inside
    const pass = (open && this.paidNight === this.nightKey()) || this.inside();
    this.gate.min.y = pass ? -1e4 : this.T; this.gate.max.y = pass ? -1e4 : this.T + 2.6; this.rope.visible = !pass || !open;
    const near = P.distanceTo(this.music.pos);
    if (open && near < 70) {
      const t = performance.now() * 0.001, beat = this.music.beatPhase(), pulse = beat < 0.2 ? 1 : 0.35;
      this.tiles.forEach((m, i) => m.color.setHSL((t * 0.15 + i * 0.11 + Math.floor(t * (this.music.track?.bpm || 120) / 60) * 0.25) % 1, 1, 0.25 * pulse + 0.05));
      this.lights.forEach((l, i) => { const a = t * (0.6 + i * 0.3) + i * 2; l.position.set(519.5 + Math.cos(a) * 2.5, this.T + 3.4, 132 + Math.sin(a * 1.3) * 3); l.intensity = 5 + pulse * 6; });
      this.ball.rotation.y += dt * 0.8;
      const vibe = this.dj ? this.dj.vibe / 100 : 0.75, bpm = this.music.track?.bpm || 120;
      const bounce = (m, ph, amt) => { const b = Math.abs(Math.sin((t * bpm / 60) * Math.PI + ph)); m.g.position.y = (m.baseY ?? (m.baseY = m.g.position.y)) + b * 0.08 * amt; m.arms.forEach((s, i) => { s.rotation.x = -0.6 - b * 2.4 * amt * (i ? 1 : 0.7); s.rotation.z = (i ? -1 : 1) * 0.3 * amt; }); m.g.rotation.y += Math.sin(t * 0.7 + ph) * 0.01; };
      this.crowd.forEach((c) => bounce(c, c.ph, vibe < 0.25 ? 0.15 : vibe));
      this.dancers.forEach((c, i) => bounce(c, i * 2, 1.2));
      if (this.dj && this.dj.vibe < 25 && this.rnd() < dt * 0.6) g.audio.burst(250, 0.5, 0.06, 0.6, 'lowpass'); // boos
    }
    if (!this.dj && open && this.music.track && this.rnd() < dt / 60) this.music.play(this.randomTrack(), true); // the house DJ changes tracks
    // music: loud inside, muffled outside, off when closed
    const level = open || this.dj ? clamp(1.6 / Math.max(1, near / 6), 0, 0.9) : 0;
    this.music.update(level, !this.inside() && near > 6);
    // dancing yourself
    if (this.dancing) {
      if (input.down('KeyW') || input.down('KeyA') || input.down('KeyS') || input.down('KeyD') || g.player.inCar || g.player.onMoped || g.fightclub?.fight) this.dancing = false;
      else {
        const club = this.inside() && open;
        const t = performance.now() * 0.001, bpm = club ? this.music.track?.bpm || 120 : 118;
        g.player.pitch = -0.1 + Math.sin(t * bpm / 60 * Math.PI) * 0.06; g.camera.rotation.z = Math.sin(t * bpm / 120 * Math.PI) * 0.05;
        g.player.yaw += Math.cos(t * bpm / 120 * Math.PI) * 0.004;
        this.danceT += dt;
        if (this.danceT > (club ? 8 : 12)) { this.danceT = 0; g.life.cheer(club ? 2 : 1, true); g.life.exert(4); }
      }
    }
    if (input.hit('KeyJ') && !g.ui.modal) this.toggleDance();
    if (this.dj) this.updateDJ(dt, input);
    // the heckler waits outside until closing time; leave the club and he's on you
    if (this.heckler) {
      const hp = this.heckler.g.position;
      if (!open) { this.root.remove(this.heckler.g); this.heckler = null; }
      else if (!this.inside() && P.distanceTo(hp) < 4 && !g.fightclub.fight) this.startStreetFight();
    }
  }
  pickRoots() { return [this.root]; }
  serialize() { return { paid: this.paidNight, dj: this.djNight }; }
  restore(d) { if (!d) return; this.paidNight = d.paid ?? -1; this.djNight = d.dj ?? -1; }
}
