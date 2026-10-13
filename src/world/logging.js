// Metsä-Pekka's logging camp, in the far north, past the lake at the end of the logging road, and Ruskala's
// sawmill out on Route 54 west. The job: fell the marked spruces with the chainsaw, load the logs onto
// the logging truck, and haul them to the sawmill. Paid per log that arrives; hit things hard and logs
// fall off the back.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { ZONES } from './terrain.js';
import { addCollider, ENV } from './colliders.js';
import { labelTex } from '../core/textures.js';
import { personModel, npcFace } from './npc.js';
import { WorkVehicle } from '../vehicles/workvehicle.js';
import { mulberry32, clamp } from '../core/util.js';

const K = (k) => `<span class="k">${k}</span>`;
const CAMP = { x: -150, z: -440 }, SAW = { x: -292, z: 128 };
const PER_LOG = 55, CAP = 6, CUT_TIME = 3.2, LOAD_REACH = 14;

export class Logging {
  constructor(game) {
    this.game = game;
    this.rnd = mulberry32(777);
    this.root = new THREE.Group(); game.scene.add(this.root);
    this.campY = ZONES.find((z) => z.id === 'logcamp').h;
    this.sawY = ZONES.find((z) => z.id === 'sawmill').h;
    this.job = null;        // { day }
    this.day = -1;          // trees regrow for a new day
    this.cut = null;        // { tree, t }
    this.buildCamp();
    this.buildSawmill();
    this.buildTrees();
    this.buildTruck();
    game.loggingPos = new THREE.Vector3(CAMP.x, this.campY, CAMP.z);
    game.sawmillPos = new THREE.Vector3(SAW.x, this.sawY, SAW.z);
  }
  person(shirt, pants, x, y, z, ry, hat = null) {
    const m = personModel(shirt, pants, npcFace(this.rnd, Math.floor(this.rnd() * 7)), hat);
    m.g.position.set(x, y, z); m.g.rotation.y = ry; this.root.add(m.g); return m;
  }
  sign(text, x, y, z, ry, w = 3.2) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.22), new THREE.MeshStandardMaterial({ map: labelTex(text, 512, 112, '#3a2a18', '#f2e2b0', 'bold 52px Arial'), roughness: 0.8 }));
    s.position.set(x, y, z); s.rotation.y = ry; this.root.add(s);
    for (const d of [-1, 1]) cyl(this.root, 0.06, y + 0.3 - ENV.groundY(x, z), MAT.wood, x + Math.cos(ry) * d * w * 0.42, (y + 0.3 + ENV.groundY(x, z)) / 2 - 0.15, z - Math.sin(ry) * d * w * 0.42, 'y', 6);
  }

  // ---------------- the camp ----------------
  buildCamp() {
    const R = this.root, Y = this.campY, cx = CAMP.x, cz = CAMP.z;
    const plank = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.95 });
    // foreman's cabin
    const c0 = [cx - 10, cz - 2];
    box(R, 6, 3, 4.5, plank, c0[0], Y + 1.5, c0[1]); addCollider(c0[0] - 3, Y, c0[1] - 2.25, c0[0] + 3, Y + 3, c0[1] + 2.25);
    const roof = box(R, 6.8, 0.25, 5.4, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }), c0[0], Y + 3.2, c0[1]); roof.rotation.x = 0.06;
    box(R, 1.0, 2.0, 0.08, MAT.wood, c0[0] + 1.5, Y + 1.0, c0[1] + 2.28);
    box(R, 1.0, 0.8, 0.06, MAT.glass, c0[0] - 1.4, Y + 1.7, c0[1] + 2.27);
    cyl(R, 0.15, 1.2, MAT.darkSteel, c0[0] - 2.3, Y + 3.6, c0[1] - 1.2, 'y', 8);
    // log piles and a chopping block
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4 - i; j++) cyl(R, 0.28, 5, MAT.wood, cx + 8, Y + 0.28 + i * 0.5, cz - 6 + j * 0.58 + i * 0.29, 'x', 10);
    addCollider(cx + 5.4, Y, cz - 6.4, cx + 10.6, Y + 1.6, cz - 3.6);
    cyl(R, 0.35, 0.6, MAT.wood, cx - 5, Y + 0.3, cz + 4, 'y', 12);
    this.sign('METSÄ-PEKAN SAVOTTA · LOGGING', cx + 14, Y + 2.2, cz + 10, Math.PI * 0.75);
    // the foreman
    this.foreman = this.person(0xc03020, 0x2a3a4a, c0[0] + 1.5, Y, c0[1] + 3.4, 0, 0xd8a020);
    this.foreman.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => `${K('E')}Talk to Metsä-Pekka <span class="dim">(logging foreman)</span>`, use: (b) => b === 'E' && this.talkForeman() }; });
  }

  // ---------------- the sawmill ----------------
  buildSawmill() {
    const R = this.root, Y = this.sawY, sx = SAW.x, sz = SAW.z;
    const shedM = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.95 });
    // open-sided saw shed with a long roof and the saw table
    box(R, 16, 0.3, 8, new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.8 }), sx - 4, Y + 5.2, sz + 4);
    for (const [x, z] of [[-11.6, 0.4], [3.6, 0.4], [-11.6, 7.6], [3.6, 7.6], [-4, 0.4], [-4, 7.6]]) { box(R, 0.3, 5.2, 0.3, MAT.wood, sx + x, Y + 2.6, sz + z); addCollider(sx + x - 0.15, Y, sz + z - 0.15, sx + x + 0.15, Y + 5.2, sz + z + 0.15); }
    box(R, 12, 0.9, 1.4, shedM, sx - 4, Y + 0.45, sz + 4); addCollider(sx - 10, Y, sz + 3.3, sx + 2, Y + 0.9, sz + 4.7);
    this.blade = cyl(R, 0.7, 0.04, MAT.steel, sx - 4, Y + 1.05, sz + 4, 'z', 24);
    // the unloading deck (drive the truck onto the yellow square)
    this.deck = new THREE.Vector3(sx + 6, Y, sz - 6);
    const pad = box(R, 8, 0.03, 8, new THREE.MeshStandardMaterial({ color: 0xd8b020, roughness: 0.9 }), this.deck.x, Y + 0.02, this.deck.z); pad.receiveShadow = true;
    // sawn timber stacks
    for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) box(R, 4, 0.12, 0.25, new THREE.MeshStandardMaterial({ color: 0xd8b880, roughness: 0.9 }), sx - 9, Y + 0.06 + k * 0.13, sz - 6 + i * 0.3);
    addCollider(sx - 11, Y, sz - 6.2, sx - 7, Y + 0.8, sz - 4.8);
    // logs waiting to be sawn, and a little office hut
    for (let i = 0; i < 4; i++) for (let j = 0; j < 7 - i; j++) cyl(R, 0.3, 5.5, MAT.wood, sx - 3 + j * 0.62 + i * 0.31, Y + 0.3 + i * 0.52, sz + 13, 'z', 10);
    addCollider(sx - 3.4, Y, sz + 10.2, sx + 1.4, Y + 2.1, sz + 15.8);
    box(R, 3, 2.4, 2.5, new THREE.MeshStandardMaterial({ color: 0x8a2018, roughness: 0.9 }), sx + 6, Y + 1.2, sz + 9); addCollider(sx + 4.5, Y, sz + 7.75, sx + 7.5, Y + 2.4, sz + 10.25);
    box(R, 3.4, 0.15, 2.9, MAT.blackPaint, sx + 6, Y + 2.5, sz + 9);
    this.sign('RUSKALAN SAHA · SAWMILL', sx - 3, Y + 2.4, sz - 10, Math.PI);
    this.sawyer = this.person(0x2a4a8a, 0x2a2a2a, sx + 1.5, Y, sz - 2, Math.PI * 0.75, 0x2a2a2a);
    this.sawyer.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => `${K('E')}Talk to Saha-Seppo <span class="dim">(sawmill)</span>`, use: (b) => b === 'E' && this.talkSawyer() }; });
  }

  // ---------------- trees you can fell ----------------
  buildTrees() {
    const r = mulberry32(4242);
    const bark = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
    const needles = new THREE.MeshStandardMaterial({ color: 0x2c4a30, roughness: 0.95, flatShading: true });
    const mark = new THREE.MeshStandardMaterial({ color: 0xff6a20, emissive: 0x401000, roughness: 0.7 });
    this.trees = [];
    for (let i = 0; i < 12; i++) {
      // a ring of marked spruces west and south of the camp (the road comes in from the north-east)
      const a = Math.PI * 0.55 + (i / 11) * Math.PI * 1.15 + (r() - 0.5) * 0.12, d = 33 + r() * 10;
      const x = CAMP.x + Math.cos(a) * d, z = CAMP.z + Math.sin(a) * d, y = ENV.groundY(x, z);
      const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.position.set(x, y, z); g.rotation.y = r() * 6.28; this.root.add(g);
      const s = 0.9 + r() * 0.3;
      cyl(g, 0.24 * s, 9 * s, bark, 0, 4.5 * s, 0, 'y', 9, 0.1 * s);
      box(g, 0.5 * s, 0.25, 0.04, mark, 0, 1.3, 0.23 * s);                      // orange paint mark: cut this one
      const crown = new THREE.Group(); g.add(crown);
      for (let t = 0; t < 4; t++) { const c = new THREE.Mesh(new THREE.ConeGeometry((2.2 - t * 0.45) * s, 3.2 * s, 8), needles); c.position.y = (3.4 + t * 1.9) * s; crown.add(c); }
      const tree = { i, x, z, y, s, g, crown, state: 'stand', fall: 0, dir: 0 };
      const col = addCollider(x - 0.3, y, z - 0.3, x + 0.3, y + 6, z + 0.3);
      tree.col = col;
      g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => this.treePrompt(tree), use: (b) => b === 'E' && this.treeUse(tree) }; });
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.trees.push(tree);
    }
  }
  setTree(t, state) {
    t.state = state;
    const on = state === 'stand';
    t.col.min.y = on ? t.y : -1e4; t.col.max.y = on ? t.y + 6 : -1e4;
    t.g.visible = state !== 'gone';
    if (state === 'stand') { t.g.rotation.x = 0; t.g.rotation.z = 0; t.crown.visible = true; t.fall = 0; t.g.position.y = t.y; }
    if (state === 'down') { t.crown.visible = false; t.g.rotation.x = Math.PI / 2 - 0.04; t.fall = 1; }
  }
  regrow() { for (const t of this.trees) this.setTree(t, 'stand'); }
  treePrompt(t) {
    if (t.state === 'stand') {
      if (!this.job) return 'A spruce with an orange paint mark <span class="dim">(talk to Metsä-Pekka for work)</span>';
      if (this.cut?.tree === t) return `Cutting… ${Math.round(this.cut.t / CUT_TIME * 100)}%`;
      return `${K('E')}Fell the tree with the chainsaw`;
    }
    if (t.state === 'down') {
      const d = this.truck.pos.distanceTo(new THREE.Vector3(t.x, t.y, t.z));
      if (this.truck.logs >= CAP) return 'Log <span class="bad">— the truck is full, haul this load to the sawmill first</span>';
      return d < LOAD_REACH ? `${K('E')}Load the log onto the truck <span class="dim">(${this.truck.logs}/${CAP})</span>` : `Log <span class="dim">— bring the logging truck closer to load it (${Math.round(d)} m away)</span>`;
    }
    return '';
  }
  treeUse(t) {
    const g = this.game;
    if (!this.job) { g.say('Better ask Metsä-Pekka before cutting down his trees.'); return; }
    if (t.state === 'stand') {
      if (g.interaction.held) { g.say('Put down what you\'re holding first (G) — you need both hands for the chainsaw.'); return; }
      this.cut = { tree: t, t: 0, buzz: 0 };
      g.say('BRRRRRRAAAP — stay close until it comes down.', 2);
    } else if (t.state === 'down') {
      if (this.truck.logs >= CAP) { g.say('The truck is full. Haul this load to the sawmill first.'); return; }
      if (this.truck.pos.distanceTo(new THREE.Vector3(t.x, t.y, t.z)) > LOAD_REACH) { g.say('Bring the logging truck closer first — the crane only reaches 14 m.'); return; }
      this.setTree(t, 'gone'); this.truck.logs++; this.showLogs();
      g.audio.thunk(1.1); g.life.exert?.(4);
      g.toast(`Log loaded with the truck's crane (${this.truck.logs}/${CAP})`, 2);
    }
  }
  updateCut(dt) {
    const c = this.cut; if (!c) return;
    const g = this.game, t = c.tree;
    if (g.player.pos.distanceTo(new THREE.Vector3(t.x, t.y, t.z)) > 3.2 || g.player.onMoped) { this.cut = null; g.toast('Stopped cutting', 1.5); return; }
    c.t += dt; c.buzz -= dt;
    if (c.buzz <= 0) { c.buzz = 0.11; g.audio.tone(95 + Math.random() * 25, 'sawtooth', 0.07, 0.13); g.audio.burst(2600, 1.5, 0.05, 0.1); }
    if (c.t >= CUT_TIME) {
      this.cut = null;
      // fall away from the player
      const away = Math.atan2(t.x - g.player.pos.x, t.z - g.player.pos.z);
      t.state = 'falling'; t.fall = 0; t.g.rotation.y = away; t.col.min.y = t.col.max.y = -1e4;
      g.say('TIMBERRR!', 2); g.audio.crash(4); g.life.exert?.(6);
    }
  }
  updateFalling(dt) {
    for (const t of this.trees) {
      if (t.state !== 'falling') continue;
      t.fall = Math.min(1, t.fall + dt * (0.25 + t.fall * 1.6));
      t.g.rotation.x = t.fall * (Math.PI / 2 - 0.04);
      if (t.fall >= 1) { this.game.audio.crash(14); this.setTree(t, 'down'); this.game.toast('Tree down. Bring the truck alongside and load it (E).', 3); }
    }
  }

  // ---------------- the logging truck ----------------
  buildTruck() {
    const g = this.game;
    const cab = new THREE.MeshStandardMaterial({ color: 0x2a5a8a, roughness: 0.45, metalness: 0.3 });
    const pos = new THREE.Vector3(CAMP.x + 4, this.campY, CAMP.z + 8);
    this.truck = new WorkVehicle(g, {
      name: 'logging truck', pos, yaw: 1.0, maxSpeed: 19, accel: 3.2, turn: 0.75, len: 8.2, wid: 2.5, eye: [-0.45, 2.6, 3.2],
      wheels: [[1.1, 2.9, 0.55, 0.35], [-1.1, 2.9, 0.55, 0.35], [1.1, -1.6, 0.55, 0.5], [-1.1, -1.6, 0.55, 0.5], [1.1, -2.9, 0.55, 0.5], [-1.1, -2.9, 0.55, 0.5]],
      hint: 'Drive gently with logs on — hit something hard and logs fall off.',
      build: (o) => {
        // cab: lower body, pillars, roof and back wall, so it looks like a cab from the driver's seat too
        box(o, 2.3, 0.85, 2.0, cab, 0, 1.62, 2.9);
        box(o, 2.4, 0.1, 2.1, cab, 0, 2.95, 2.9);                                     // roof
        box(o, 2.3, 0.9, 0.08, cab, 0, 2.5, 1.92);                                     // back wall
        for (const x of [-1.12, 1.12]) for (const z of [1.95, 3.85]) box(o, 0.1, 0.9, 0.1, cab, x, 2.5, z); // pillars
        box(o, 2.1, 0.25, 0.45, MAT.blackPaint, 0, 2.15, 3.62);                         // dashboard
        const sw = cyl(o, 0.2, 0.04, MAT.blackPaint, -0.45, 2.3, 3.3, 'z', 16); sw.rotation.x = -0.5;
        box(o, 0.5, 0.12, 0.5, MAT.seat, -0.45, 2.1, 2.55); box(o, 0.5, 0.6, 0.12, MAT.seat, -0.45, 2.4, 2.25);
        box(o, 2.3, 0.7, 1.0, cab, 0, 1.45, 4.25);                                   // nose
        box(o, 0.9, 0.3, 0.05, MAT.chrome, 0, 1.4, 4.76);
        box(o, 2.0, 0.25, 7.6, MAT.darkSteel, 0, 0.95, 0);                           // frame
        box(o, 2.4, 0.15, 5.0, MAT.darkSteel, 0, 1.15, -1.5);                         // log bed
        for (const z of [0.9, -1.5, -3.8]) for (const x of [-1.15, 1.15]) box(o, 0.12, 1.7, 0.12, MAT.darkSteel, x, 2.0, z); // stakes
        cyl(o, 0.12, 2.2, MAT.yellowPaint, 0.6, 2.4, 1.4, 'y', 8);                    // crane post
        const arm = box(o, 0.18, 0.18, 3.0, MAT.yellowPaint, 0.6, 3.4, 0.0); arm.rotation.x = 0.25;
        for (const x of [-0.9, 0.9]) cyl(o, 0.1, 1.0, MAT.chrome, x, 3.1, 2.0, 'y', 8); // exhaust stacks
        // the load (shown up to 6)
        this.logMeshes = [];
        const logM = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }), endM = new THREE.MeshStandardMaterial({ color: 0xd8b880, roughness: 1 });
        for (let k = 0; k < CAP; k++) {
          const row = k < 3 ? 0 : k < 5 ? 1 : 2, col = k < 3 ? k - 1 : k < 5 ? (k - 3) - 0.5 : 0;
          const lg = new THREE.Group(); lg.position.set(col * 0.7, 1.55 + row * 0.6, -1.5); o.add(lg);
          cyl(lg, 0.32, 5.4, logM, 0, 0, 0, 'z', 10); for (const e of [-2.71, 2.71]) cyl(lg, 0.3, 0.02, endM, 0, 0, e, 'z', 10);
          lg.visible = false; this.logMeshes.push(lg);
        }
      },
      onCrash: (v) => this.truckCrash(v),
      onDriveKey: (input) => { if (input.hit('KeyF')) this.unload(); },
      actionPrompt: () => (this.truck?.logs ? `\n<span class="dim">Load: ${this.truck.logs}/${CAP} logs</span>` : ''),
    });
    this.truck.logs = 0;
  }
  showLogs() { this.logMeshes.forEach((m, i) => { m.visible = i < this.truck.logs; }); }
  truckCrash(v) {
    const g = this.game, T = this.truck;
    if (!T.logs || v < 5) return;
    const lost = Math.min(T.logs, v > 12 ? 3 : v > 8 ? 2 : 1);
    T.logs -= lost; this.showLogs(); this.lostToday = (this.lostToday || 0) + lost;
    g.say(`CRASH — ${lost} log${lost > 1 ? 's' : ''} fell off the back! (${T.logs} left)`, 3);
  }
  atDeck() { return Math.hypot(this.truck.pos.x - this.deck.x, this.truck.pos.z - this.deck.z) < 6; }
  unload() {
    const g = this.game, T = this.truck;
    if (!this.atDeck()) { if (T.logs) g.toast('Unload at the sawmill: park on the yellow deck by Route 54 west and press F.', 3); return; }
    if (!T.logs) { g.say('Saha-Seppo: "Nothing on the truck? Go cut some."', 3); return; }
    if (Math.abs(T.speed) > 0.5) { g.say('Stop on the deck first.'); return; }
    const n = T.logs, pay = n * PER_LOG + (n === CAP ? 60 : 0);
    T.logs = 0; this.showLogs(); this.delivered = (this.delivered || 0) + n;
    g.audio.crash(8); g.addMoney(pay, `Sawmill: ${n} log${n > 1 ? 's' : ''}${n === CAP ? ' (full load bonus)' : ''}`);
    g.say(`Saha-Seppo: "${n === CAP ? 'A full load, nice! ' : ''}${n} logs, ${pay} mk." ${this.trees.some((t) => t.state !== 'gone') ? 'Head back to the camp for more.' : 'That\'s all of Pekka\'s marked trees for today.'}`, 5);
    if (n === CAP) g.ach?.unlock('lumberjack');
    if (!this.trees.some((t) => t.state !== 'gone')) this.endJob(true);
  }

  // ---------------- people ----------------
  talkForeman() {
    const g = this.game, h = g.life.hours;
    if (this.job) {
      const left = this.trees.filter((t) => t.state !== 'gone').length;
      g.ui.dialog('Metsä-Pekka', `${left} marked trees still out there, and ${this.truck.logs} logs on the truck. Haul them to Saha-Seppo's sawmill on Route 54 west — ${PER_LOG} mk a log, and a bonus for a full load of ${CAP}.`, [
        { label: 'Back to work', go: () => {} },
        { label: 'Bring the truck back here for me', go: () => { this.truck.reset(); this.truck.logs = 0; this.showLogs(); g.say('Metsä-Pekka sends a lad to fetch the truck. (Any logs on it are gone.)', 4); } },
      ]);
      return;
    }
    if (h < 6 || h >= 20) { g.ui.dialog('Metsä-Pekka', 'No felling in the dark, friend. Come back after six in the morning.', [{ label: 'OK', go: () => {} }]); return; }
    if (this.day === g.life.day && !this.trees.some((t) => t.state !== 'gone')) { g.ui.dialog('Metsä-Pekka', 'You\'ve cut everything I marked for today. Come back tomorrow.', [{ label: 'OK', go: () => {} }]); return; }
    g.ui.dialog('Metsä-Pekka', `Need work? I've marked twelve spruces with orange paint. Fell them with the chainsaw, load them on the truck with the crane and haul them down to the sawmill on Route 54 west. ${PER_LOG} mk a log, +60 mk for a full load of ${CAP}. Mind the bumps — logs that fall off don't get paid.`, [
      { label: 'I\'ll do it', go: () => this.startJob() },
      { label: 'Not today', go: () => {} },
    ]);
  }
  startJob() {
    const g = this.game;
    if (this.day !== g.life.day) { this.day = g.life.day; this.regrow(); }
    this.job = { day: g.life.day }; this.lostToday = 0;
    if (this.truck.pos.distanceTo(this.truck.home.pos) > 40 && !this.truck.driving) { this.truck.reset(); }
    g.jobs.focus = 'logging';
    g.say('Metsä-Pekka: "Chainsaw\'s on the tree stump. Go on then." (E on a marked tree)', 4);
  }
  endJob(done) {
    this.job = null;
    if (this.game.jobs.focus === 'logging') this.game.jobs.focus = null;
    if (done) this.game.say('Logging job done for today. Metsä-Pekka will have more trees marked tomorrow.', 4);
  }
  talkSawyer() {
    const g = this.game;
    if (this.atDeck() && this.truck.logs && !this.truck.driving) { this.unload(); return; }
    g.ui.dialog('Saha-Seppo (sawmill)', this.job ? `Park the logging truck on the yellow deck and press F from the cab — or talk to me. ${PER_LOG} mk a log.` : 'This is Ruskala\'s sawmill. Metsä-Pekka\'s logging camp, way down the logging road in the northern forest, always needs a driver.', [{ label: 'OK', go: () => {} }]);
  }

  // ---------------- per frame ----------------
  update(dt, input) {
    const g = this.game;
    if (this.day !== g.life.day && !this.job) { this.day = g.life.day; this.regrow(); }
    this.truck.update(dt, input);
    this.updateCut(dt);
    this.updateFalling(dt);
    this.blade.rotation.x += dt * 30;
  }

  // ---------------- job objective (shown in the guide) ----------------
  objective(mark, dist, also) {
    const T = this.truck, here = this.game.player.pos;
    const left = this.trees.filter((t) => t.state !== 'gone');
    const tp = (t) => new THREE.Vector3(t.x, t.y, t.z);
    const J = 'LOGGING JOB';
    if (T.logs >= CAP || (T.logs && !left.length)) {
      if (!T.driving) return { job: J, st: { title: `Haul ${T.logs} logs to the sawmill` }, s: { text: `Get in the logging truck (E) and drive to the sawmill on Route 54 west (${dist(this.deck)} m). Drive gently — hard hits knock logs off.${also}`, targets: [mark(T.pos, 'Logging truck', '#ffd23c', 3)] } };
      return { job: J, st: { title: `Haul ${T.logs} logs to the sawmill` }, s: { text: this.atDeck() ? 'Stop on the yellow deck and press F to unload.' : `Logging road → Forest Road → Route 54 west, then the sawmill road. ${dist(this.deck)} m to go.${also}`, targets: [mark(this.deck, 'Sawmill deck — unload (F)', '#4ad8ff', 1)] } };
    }
    if (this.cut) return { job: J, st: { title: 'Felling a tree…' }, s: { text: 'Stay next to it until it comes down.', targets: [] } };
    const down = left.filter((t) => t.state === 'down').sort((a, b) => tp(a).distanceTo(here) - tp(b).distanceTo(here))[0];
    if (down) {
      const far = T.pos.distanceTo(tp(down)) > LOAD_REACH;
      if (far) return { job: J, st: { title: 'Bring the truck to the felled log' }, s: { text: `The crane reaches ${LOAD_REACH} m. Drive the logging truck next to the log, then press E on the log.${also}`, targets: [mark(T.pos, 'Logging truck', '#ffd23c', 3), mark(tp(down), 'Felled log', '#4ad8ff', 0.6)] } };
      return { job: J, st: { title: `Load the log (${T.logs}/${CAP})` }, s: { text: `Get out and press E on the felled log to crane it onto the truck.${also}`, targets: [mark(tp(down), 'Load log (E)', '#4ad8ff', 0.6)] } };
    }
    const stand = left.filter((t) => t.state === 'stand').sort((a, b) => tp(a).distanceTo(here) - tp(b).distanceTo(here))[0];
    if (stand) {
      if (here.distanceTo(tp(stand)) > 120) return { job: J, st: { title: 'Drive to the logging camp' }, s: { text: `Metsä-Pekka's camp is at the end of the logging road, in the far north, past the lake (${dist(tp(stand))} m). Take Forest Road north from Route 54, then the logging road.${also}`, targets: [mark(this.game.loggingPos, 'Logging camp', '#4ad8ff', 3)] } };
      return { job: J, st: { title: `Fell a marked tree (${left.length} left)` }, s: { text: `Walk up to a spruce with an orange paint mark and press E to cut it with the chainsaw.${T.logs ? ` (${T.logs}/${CAP} logs on the truck — or haul them now.)` : ''}${also}`, targets: [mark(tp(stand), 'Marked tree', '#ff9a3c', 1.5)] } };
    }
    return null;
  }

  serialize() { return { job: this.job, day: this.day, trees: this.trees.map((t) => (t.state === 'falling' ? 'down' : t.state)), truck: { ...this.truck.serialize(), logs: this.truck.logs } }; }
  restore(d) {
    if (!d) return;
    this.job = d.job || null; this.day = d.day ?? -1;
    (d.trees || []).forEach((s, i) => { if (this.trees[i]) this.setTree(this.trees[i], s); });
    this.truck.restore(d.truck); this.truck.logs = clamp(d.truck?.logs || 0, 0, CAP); this.showLogs();
  }
}
