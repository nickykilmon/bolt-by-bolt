// Jobs: parcel deliveries, lawn mowing, scrap collection, workshop jobs; scrapyard used-part stock.
import * as THREE from 'three';
import { DEFS } from '../mechanics/partsdb.js';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { heightAt, nearestRoad, ROADS, ZONES } from '../world/terrain.js';
import { interact } from '../world/buildings.js';
import { mulberry32, fmtMoney, clamp } from '../core/util.js';

const SCRAP_PRICE = 1.4; // mk / kg

// Esa's workshop jobs (variant index = position)
export const WORKSHOP_JOBS = [
  { title: 'Finish rebuilding a customer\'s cylinder head', pay: 380 },
  { title: 'Fit a carburettor to a customer\'s intake manifold', pay: 240 },
  { title: 'Ignition overhaul: distributor, plugs and wires', pay: 300 },
  { title: 'Fit an exhaust manifold and thermostat to a head', pay: 320 },
  { title: 'Turbo conversion on a customer\'s head', pay: 600 },
  { title: 'Twin-choke carburettor upgrade', pay: 280 },
];

export class Jobs {
  constructor(game) {
    this.game = game;
    this.parcels = null;     // { list:[{uid, dest, name, pay}], deadline }
    this.mowing = null;      // { active, paid }
    this.workshop = null;    // { variant, tasks:[{host, slot, fluid?}], items:[uids], pay }
    this.scrapKnown = false;
    this.restockDay = -1;
    this.scrapSeeded = false;
    this.mowCut = null;
    this.buildLawn();
    this.buildMower();
  }

  // ---------------- parcels ----------------
  offerParcels() {
    const g = this.game;
    if (this.parcels) {
      const left = this.parcels.list.filter((p) => g.asm.get(p.uid));
      if (!left.length) { this.parcels = null; return this.offerParcels(); }
      g.ui.dialog('Helena (post office)', `You still have ${left.length} parcel(s): ${left.map((p) => p.name).join(', ')}. Deliver them by ${g.life.fmtTime(this.parcels.deadline)}.`, [{ label: 'OK', go: () => {} }]);
      return;
    }
    const pool = g.mailboxes.filter((m) => m.id !== 'mb_jc');
    const rnd = mulberry32(g.life.day * 31 + 7);
    const n = 2 + Math.floor(rnd() * 3);
    const picks = [];
    while (picks.length < n) { const m = pool[Math.floor(rnd() * pool.length)]; if (!picks.includes(m)) picks.push(m); }
    const post = g.npcSpots.post;
    const list = picks.map((m) => ({ dest: m.id, name: m.name, pay: Math.round(45 + m.pos.distanceTo(post) * 0.18) }));
    const total = list.reduce((s, p) => s + p.pay, 0);
    g.ui.dialog('Helena (post office)', `I have ${n} parcels: ${list.map((p) => `${p.name} (${p.pay} mk)`).join(', ')}. That's ${total} mk if you deliver them within 4 hours. Late parcels pay half.`, [
      { label: 'Take the parcels', go: () => {
        this.parcels = { list: [], deadline: g.life.minutes + 240 };
        this.focus = 'parcels';
        list.forEach((p, i) => {
          const it = g.asm.create('parcel', { props: { dest: p.dest, destName: p.name, pay: p.pay } });
          const at = g.postCounter.clone().add(new THREE.Vector3((i - (n - 1) / 2) * 0.3, 0, 0));
          g.asm.dropAt(it, at, 0, null);
          p.uid = it.uid; this.parcels.list.push(p);
        });
        g.say('Parcels are on the post office counter. Destinations are marked on the map (M).');
      } },
      { label: 'Not now', go: () => {} },
    ]);
  }
  mailboxPrompt(mb) {
    const h = this.game.interaction.held;
    if (h?.def.type === 'parcel') return h.props.dest === mb.id ? `Mailbox: ${mb.name}\n<span class="k">E</span>Deliver the parcel` : `Mailbox: ${mb.name}\n<span class="bad">This parcel is for ${h.props.destName}</span>`;
    if (mb.id === 'mb_jc') return `Your mailbox${this.game.mail?.length ? ' — there\'s a letter!' : ''}`;
    return `Mailbox: ${mb.name}`;
  }
  mailboxUse(mb, btn) {
    const g = this.game, h = g.interaction.held;
    if (btn !== 'E' || h?.def.type !== 'parcel' || h.props.dest !== mb.id) return;
    const late = this.parcels && g.life.minutes > this.parcels.deadline;
    const pay = Math.round(h.props.pay * (late ? 0.5 : 1));
    g.asm.remove(g.interaction.release());
    g.audio.thunk(0.4);
    g.addMoney(pay, `Parcel delivered to ${mb.name}${late ? ' (late)' : ''}`);
    if (this.parcels) { this.parcels.list = this.parcels.list.filter((p) => g.asm.get(p.uid)); if (!this.parcels.list.length) { this.parcels = null; if (this.focus === 'parcels') this.focus = null; g.say('All parcels delivered. Helena will be pleased.'); } }
  }

  // ---------------- lawn mowing ----------------
  buildLawn() {
    const g = this.game, L = g.lawn;
    const n = 420;
    const geo = new THREE.ConeGeometry(0.09, 0.35, 4).translate(0, 0.17, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a8a2a, roughness: 1 });
    this.grass = new THREE.InstancedMesh(geo, mat, n);
    this.tufts = [];
    const r = mulberry32(3);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const x = L.x + (r() - 0.5) * L.w, z = L.z + (r() - 0.5) * L.d;
      this.tufts.push({ x, z, s: 0.8 + r() * 0.6 });
      d.position.set(x, L.y, z); d.scale.set(1, this.tufts[i].s, 1); d.rotation.y = r() * 3; d.updateMatrix(); this.grass.setMatrixAt(i, d.matrix);
    }
    this.mowCut = new Uint8Array(n);
    g.scene.add(this.grass);
  }
  setTuft(i, cut) {
    const t = this.tufts[i], d = new THREE.Object3D();
    d.position.set(t.x, this.game.lawn.y, t.z); d.scale.set(1, cut ? 0.12 : t.s, 1); d.updateMatrix();
    this.grass.setMatrixAt(i, d.matrix); this.grass.instanceMatrix.needsUpdate = true;
    this.mowCut[i] = cut ? 1 : 0;
  }
  buildMower() {
    const g = this.game, L = g.lawn;
    const m = new THREE.Group(); m.position.set(L.x + L.w / 2 + 2, L.y, L.z); g.scene.add(m);
    box(m, 0.5, 0.25, 0.6, MAT.redPaint, 0, 0.2, 0.15);
    cyl(m, 0.12, 0.2, MAT.darkSteel, 0, 0.42, 0.15, 'y', 10);
    for (const [x, z] of [[0.24, 0.4], [-0.24, 0.4], [0.24, -0.1], [-0.24, -0.1]]) cyl(m, 0.09, 0.05, MAT.rubber, x, 0.09, z, 'x', 10);
    const h = cyl(m, 0.012, 1.1, MAT.chrome, 0, 0.6, -0.35, 'y', 6); h.rotation.x = -0.55;
    box(m, 0.45, 0.03, 0.03, MAT.blackPaint, 0, 1.05, -0.62);
    const grip = box(m, 0.6, 0.6, 0.6, MAT.hit, 0, 0.8, -0.5); grip.castShadow = false;
    m.traverse((o) => { if (o.isMesh && o.material !== MAT.hit) o.castShadow = true; });
    const state = { obj: m, grabbed: false };
    const def = {
      prompt: () => {
        const pct = Math.round(this.mowProgress() * 100);
        return `<span class="k">E</span>${state.grabbed ? 'Let go of' : 'Push'} the lawn mower` + (this.mowing ? `\n<span class="dim">Lawn ${pct}% mowed</span>` : '\n<span class="dim">Talk to Pertti about mowing</span>');
      },
      use: (btn) => { if (btn === 'E') { state.grabbed = !state.grabbed; state.dist = undefined; g.player.pushing = state.grabbed ? state : null; } },
    };
    interact(m, def); m.userData.interactDef = def;
    this.mower = state;
  }
  mowProgress() { let c = 0; for (const v of this.mowCut) c += v; return c / this.mowCut.length; }
  offerMowing() {
    const g = this.game;
    if (this.mowing && this.mowProgress() >= 0.9) {
      const pay = 180;
      this.mowing = null; if (this.focus === 'mowing') this.focus = null;
      g.addMoney(pay, 'Mowed Pertti\'s lawn');
      g.ui.dialog('Pertti (neighbour)', 'Hmm. Not bad. Not bad at all. Here. Same again next week?', [{ label: 'Thanks', go: () => {} }]);
      this.lastMowWeek = Math.floor(g.life.day / 7);
      return;
    }
    if (this.mowing) { g.ui.dialog('Pertti (neighbour)', `You've done ${Math.round(this.mowProgress() * 100)}%. I said the WHOLE lawn. The mower is by the lawn.`, [{ label: 'OK', go: () => {} }]); return; }
    if (this.lastMowWeek === Math.floor(g.life.day / 7)) { g.ui.dialog('Pertti (neighbour)', 'The grass hasn\'t grown back yet. Come back next week.', [{ label: 'OK', go: () => {} }]); return; }
    g.ui.dialog('Pertti (neighbour)', 'My knees are no good. Mow the lawn by the house and I\'ll pay you 180 mk. The mower is the red thing.', [
      { label: 'Deal', go: () => { this.mowing = { active: true }; this.focus = 'mowing'; for (let i = 0; i < this.tufts.length; i++) this.setTuft(i, false); g.say('Push the mower over the lawn (E to grab it).'); } },
      { label: 'Maybe later', go: () => {} },
    ]);
  }

  // ---------------- scrap ----------------
  seedScrap() {
    if (this.scrapSeeded) return;
    this.scrapSeeded = true;
    const g = this.game, r = mulberry32(911);
    const roads = ROADS.filter((x) => !x.town);
    for (let i = 0; i < 26; i++) {
      const road = roads[Math.floor(r() * roads.length)];
      const s = road.samples[Math.floor(r() * road.samples.length)];
      const ang = r() * Math.PI * 2, d = road.w / 2 + 4 + r() * 10;
      const x = s.x + Math.cos(ang) * d, z = s.z + Math.sin(ang) * d;
      if (ZONES.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 5)) continue;
      const id = r() < 0.5 ? 'scrap_small' : r() < 0.7 ? 'scrap_med' : 'scrap_big';
      const it = g.asm.create(id, { cond: 0.1 });
      g.asm.dropAt(it, new THREE.Vector3(x, heightAt(x, z), z), r() * 6, null);
    }
  }
  offerScrap() {
    const g = this.game;
    this.scrapKnown = true; this.scrapActive = true; this.focus = 'scrap';
    g.ui.dialog('Scrap metal', `Old junk lies in ditches and forest edges all over the parish. Raimo at the scrapyard (far west) pays ${SCRAP_PRICE} mk/kg on his scale. Heavy pieces need the car — put them in the boot. Spots are now marked on your map (M).`, [{ label: 'Got it', go: () => {} }]);
  }
  scaleItems() {
    const s = this.game.scrapScale;
    return [...this.game.asm.items.values()].filter((it) => it.loc?.kind === 'world' && !it.loc.cont && it.def.kind !== 'root' && it.props.owner !== 'esa' && Math.abs(it.loc.pos[0] - s.center.x) < s.half[0] && Math.abs(it.loc.pos[2] - s.center.z) < s.half[1]);
  }
  sellScale() {
    const g = this.game;
    const items = this.scaleItems();
    if (!items.length) { g.ui.dialog('Raimo (scrapyard)', 'The scale is empty. Put the stuff ON the scale. The big steel plate.', [{ label: 'OK', go: () => {} }]); return; }
    let pay = 0, kg = 0;
    for (const it of items) {
      const m = g.asm.subtreeMass(it); kg += m;
      pay += it.def.kind === 'scrap' ? m * SCRAP_PRICE : Math.max(m * SCRAP_PRICE, g.sellPrice(it) * 0.35);
      g.asm.remove(it);
    }
    pay = Math.round(pay);
    g.addMoney(pay, `Scrap sold to Raimo (${Math.round(kg)} kg)`);
    this.scrapActive = false; if (this.focus === 'scrap') this.focus = null;
    g.ui.dialog('Raimo (scrapyard)', `${Math.round(kg)} kilos. ${pay} mk. Pleasure doing business.`, [{ label: 'Thanks', go: () => {} }]);
  }
  restockScrapyard() {
    const g = this.game;
    if (this.restockDay === g.life.day) return;
    this.restockDay = g.life.day;
    for (const it of [...g.asm.items.values()]) if (it.props.forSale && !it.slot && it.loc?.kind === 'world') g.asm.remove(it);
    const r = mulberry32(g.life.day * 97 + 13);
    const pool = Object.values(DEFS).filter((d) => d.kind === 'part' && d.shop && d.mass <= 30 && !['chassis'].includes(d.type));
    let k = 0;
    for (const rk of g.scrapRacks) for (const y of [0.08, 0.83, 1.53]) for (let j = 0; j < 3; j++) {
      if (r() < 0.25) continue;
      const def = pool[Math.floor(r() * pool.length)];
      const cond = clamp(0.08 + r() * r() * 0.9, 0.05, 0.85);
      const it = g.asm.create(def.id, { cond, known: false, props: { forSale: Math.max(10, Math.round(def.price * (0.18 + r() * 0.15))) } });
      if (def.host === 'piston') g.asm.install(g.asm.create('conrod_16', { cond: cond * 1.1, known: false }), it, 'rod', { fastened: true });
      rk.updateWorldMatrix(true, false);
      const p = rk.localToWorld(new THREE.Vector3(-1.6 + j * 1.6, y + 0.03, 0));
      g.asm.dropAt(it, p, r() * 6, null);
      k++;
    }
  }

  // ---------------- workshop jobs (Esa) ----------------
  offerWorkshop() {
    const g = this.game, asm = g.asm;
    const w = this.workshop;
    if (w) {
      const left = w.tasks.filter((t) => !this.taskDone(t));
      if (!left.length) {
        for (const u of w.items) { const it = asm.get(u); if (it) asm.remove(it); }
        this.workshop = null; if (this.focus === 'workshop') this.focus = null;
        g.addMoney(w.pay, `Workshop job for Esa: ${w.title}`);
        g.ui.dialog('Esa (mechanic)', `Let me check… torque is right, everything's there. Good work. ${w.pay} mk. Come back tomorrow, there's always something.`, [{ label: 'Thanks', go: () => {} }]);
        this.lastWorkshopDay = g.life.day;
        return;
      }
      g.ui.dialog('Esa (mechanic)', `${w.title}. Still to do: ${left.map((t) => t.label).join('; ')}. Everything you need is on my bench.`, [{ label: 'OK', go: () => {} }]);
      return;
    }
    if (this.lastWorkshopDay === g.life.day) { g.ui.dialog('Esa (mechanic)', 'Nothing more today. Come back tomorrow.', [{ label: 'OK', go: () => {} }]); return; }
    // two jobs to pick from each day, rotating through the whole list
    const a = g.life.day % WORKSHOP_JOBS.length, b = (g.life.day * 7 + 3) % WORKSHOP_JOBS.length;
    const offer = [...new Set([a, b === a ? (a + 1) % WORKSHOP_JOBS.length : b])];
    g.ui.dialog('Esa (mechanic)', `I've got ${offer.length > 1 ? 'two jobs, pick one' : 'a job'}. Use my tools on the table by the bench, and torque everything to spec.`, [
      ...offer.map((v) => ({ label: `${WORKSHOP_JOBS[v].title} — ${WORKSHOP_JOBS[v].pay} mk`, go: () => this.startWorkshop(v, WORKSHOP_JOBS[v].title, WORKSHOP_JOBS[v].pay) })),
      { label: 'Not today', go: () => {} },
    ]);
  }
  startWorkshop(variant, title, pay) {
    const g = this.game, asm = g.asm;
    const at = (dx, dz) => g.workshopAt(dx * 0.75, dz * 0.6); // along the workbench
    const items = [];
    const drop = (id, dx, dz, o) => { const it = asm.create(id, o); asm.dropAt(it, at(dx, dz), 0, null); items.push(it.uid); return it; };
    let tasks;
    if (variant === 0) {
      const head = drop('head_16', 0, 0, { cond: 0.9 });
      for (const [s, id] of [['valvesIn', 'valves_in'], ['valvesEx', 'valves_ex'], ['valveSprings', 'valve_springs'], ['retainers', 'valve_retainers'], ['camBearings', 'cam_bearings']]) asm.install(asm.create(id, { cond: 0.9 }), head, s, { fastened: true });
      const cam = asm.create('camshaft_std', { cond: 0.9 }); asm.install(cam, head, 'camshaft', { fastened: true, q: 0.2 });
      drop('rockers', 1.0, 0, { cond: 0.9 }); drop('valve_cover', -1.1, 0.05, { cond: 0.9 });
      for (let i = 0; i < 4; i++) drop('spark_plug', 1.4 + i * 0.12, -0.2);
      tasks = [{ host: head.uid, slot: 'camshaft', label: 'torque the cam cap bolts' }, { host: head.uid, slot: 'rockers', label: 'fit & torque the rockers' },
        ...[1, 2, 3, 4].map((i) => ({ host: head.uid, slot: 'plug' + i, label: `spark plug #${i}` })), { host: head.uid, slot: 'valveCover', label: 'valve cover' }];
    } else if (variant === 1 || variant === 5) {
      // customer's intake manifold: fit and torque the carburettor (single, or the twin-choke upgrade), then the air filter
      const im = drop('intake_manifold', 0, 0, { cond: 0.9 });
      drop(variant === 5 ? 'carb_twin' : 'carb_single', 1.2, -0.1, { cond: 0.95 });
      drop('air_filter', -1.1, 0.05, { cond: 1 });
      tasks = [{ host: im.uid, slot: 'carb', label: `fit & torque the ${variant === 5 ? 'twin-choke ' : ''}carburettor` }, { host: '', hostOf: 'carb', slot: 'airFilter', label: 'fit the air filter' }];
    } else {
      // a finished customer head on the bench; the job bolts things onto it
      const head = drop('head_16', 0, 0, { cond: 0.9 });
      const put = (slot, id, o = {}) => { const p = asm.create(id, { cond: 0.9 }); asm.install(p, head, slot, { fastened: true }); return p; };
      for (const [s, id] of [['valvesIn', 'valves_in'], ['valvesEx', 'valves_ex'], ['valveSprings', 'valve_springs'], ['retainers', 'valve_retainers'], ['camBearings', 'cam_bearings'], ['camshaft', 'camshaft_std'], ['rockers', 'rockers'], ['valveCover', 'valve_cover']]) put(s, id);
      if (variant === 2) { // ignition overhaul
        drop('distributor', 1.0, 0); for (let i = 0; i < 4; i++) drop('spark_plug', 1.4 + i * 0.12, -0.2); drop('plug_wires', -1.1, 0.05);
        tasks = [{ host: head.uid, slot: 'distributor', label: 'fit & bolt down the distributor' }, ...[1, 2, 3, 4].map((i) => ({ host: head.uid, slot: 'plug' + i, label: `spark plug #${i}` })), { host: head.uid, slot: 'plugWires', label: 'connect the plug wires' }];
      } else if (variant === 3) { // exhaust side
        drop('exhaust_gasket', 1.0, 0.15); drop('exhaust_manifold', 1.4, -0.1); drop('thermostat', -1.1, 0.05);
        tasks = [{ host: head.uid, slot: 'exGasket', label: 'fit the exhaust manifold gasket' }, { host: head.uid, slot: 'exManifold', label: 'fit & torque the exhaust manifold (8 nuts)' }, { host: head.uid, slot: 'thermostat', label: 'fit the thermostat housing' }];
      } else { // turbo conversion
        put('exGasket', 'exhaust_gasket'); put('exManifold', 'header_42');
        drop('turbo_kit', 1.3, -0.1, { cond: 1 }); drop('intake_manifold', -1.0, 0.1); drop('carb_twin', -1.5, -0.15); drop('air_filter', 1.7, 0.15);
        tasks = [{ host: head.uid, slot: 'turbo', label: 'bolt the turbo to the header (4 flange nuts)' }, { host: head.uid, slot: 'intake', label: 'fit the intake manifold' }, { host: '', hostOf: 'intake', slot: 'carb', label: 'fit & torque the twin-choke carb' }, { host: '', hostOf: 'carb', slot: 'airFilter', label: 'fit the air filter' }];
      }
    }
    this.workshop = { variant, title, pay, tasks, items };
    this.focus = 'workshop';
    g.say('The job is on Esa\'s workbench. His tools are on the table next to it — the guide (top left) shows each step.');
  }
  // where each customer part sits on Esa's bench (by item type, in order)
  benchLayout(defId, n) {
    const L = { head_16: [0, 0], rockers: [1.0, 0], valve_cover: [-1.1, 0.05], spark_plug: [1.4 + n * 0.12, -0.2], intake_manifold: [0, 0], carb_single: [1.2, -0.1], carb_twin: [1.2, -0.1], air_filter: [-1.1, 0.05],
      distributor: [1.0, 0], plug_wires: [-1.1, 0.05], exhaust_gasket: [1.0, 0.15], exhaust_manifold: [1.4, -0.1], thermostat: [-1.1, 0.05], turbo_kit: [1.3, -0.1] };
    return L[defId] || [0.5 + n * 0.2, 0.2];
  }
  // put loose job parts back on the bench (fixes saves where they ended up inside the wall)
  relayoutWorkshop() {
    const g = this.game, asm = g.asm, w = this.workshop;
    if (!w) return;
    if (/gearbox/i.test(w.title)) { // the old gearbox job couldn't be finished — cancel it
      for (const u of w.items) { const it = asm.get(u); if (it) asm.remove(it); }
      this.workshop = null; if (this.focus === 'workshop') this.focus = null;
      g.say('Esa: "Forget that gearbox, the customer took it elsewhere. Ask me for another job."', 7);
      return;
    }
    const seen = {};
    for (const u of w.items) {
      const it = asm.get(u);
      if (!it || it.slot || it.loc?.kind !== 'world' || it.loc.cont) continue;
      const n = seen[it.defId] = (seen[it.defId] ?? -1) + 1;
      const [dx, dz] = this.benchLayout(it.defId, n);
      asm.dropAt(it, g.workshopAt(dx * 0.75, dz * 0.6), 0, null);
    }
  }
  taskHost(t) {
    const asm = this.game.asm;
    if (t.hostOf) { // a part that is itself fitted as part of the job (e.g. the carb's air filter)
      const first = this.workshop?.tasks.find((x) => x.slot === t.hostOf);
      const fh = first ? this.taskHost(first) : null; // follows chains (air filter -> carb -> intake -> head)
      return fh ? fh.kids[first.slot] || null : null;
    }
    return asm.get(t.host);
  }
  taskDone(t) {
    const asm = this.game.asm, host = this.taskHost(t);
    if (!host) return false;
    if (t.fluid) return (host.props[t.fluid] || 0) >= t.min;
    const k = host.kids[t.slot];
    return !!k && asm.fastenerSummary(k).secure && asm.fastenerSummary(k).over === 0;
  }

  // ---------------- per frame ----------------
  // Esa's own tool set lives on his tool table; it walks back there if you take it away
  ensureEsaTools() {
    const g = this.game;
    if ([...g.asm.items.values()].some((i) => i.props.owner === 'esa')) return;
    const ids = ['ratchet', 'socket_case', 'torque_wrench', 'plug_socket', 'screwdriver_flat', 'screwdriver_ph', 'wrench_10', 'wrench_13', 'wrench_17', 'lug_wrench', 'bolt_kit'];
    ids.forEach((id, i) => {
      const it = g.asm.create(id, { props: { owner: 'esa', ...(id === 'socket_case' ? { sockets: [8, 10, 12, 13, 14, 17, 19] } : {}), ...(id === 'ratchet' ? { socket: 10 } : {}) } });
      g.asm.dropAt(it, g.esaToolSpot(i, ids.length), Math.PI / 2, null);
    });
  }
  returnEsaTools() {
    const g = this.game, home = g.esaShopPos;
    const tools = [...g.asm.items.values()].filter((i) => i.props.owner === 'esa');
    tools.forEach((it, i) => {
      if (it.slot) return;
      const p = it.loc?.kind === 'held' || it.loc?.kind === 'inv' ? g.player.pos : it.obj.getWorldPosition(new THREE.Vector3());
      if (Math.hypot(p.x - home.x, p.z - home.z) < 45) return;
      if (g.interaction.held === it) g.interaction.release();
      g.inventory = g.inventory.filter((u) => u !== it.uid);
      g.asm.dropAt(it, g.esaToolSpot(i, tools.length), Math.PI / 2, null);
      g.say(`Esa's ${it.def.name.toLowerCase()} went back to his tool table — those stay at the garage.`);
    });
  }

  update(dt) {
    const g = this.game;
    this.restockScrapyard();
    if (!this.esaChecked) { this.esaChecked = true; this.ensureEsaTools(); }
    this.toolT = (this.toolT || 0) - dt;
    if (this.toolT <= 0) { this.toolT = 2; this.returnEsaTools(); }
    // mowing
    if (g.player.pushing === this.mower) {
      const p = this.mower.obj.position;
      const L = g.lawn;
      if (Math.abs(p.x - L.x) < L.w / 2 + 1 && Math.abs(p.z - L.z) < L.d / 2 + 1) {
        let cutNow = 0;
        this.tufts.forEach((t, i) => { if (!this.mowCut[i] && Math.hypot(t.x - p.x, t.z - p.z) < 0.55) { this.setTuft(i, true); cutNow++; } });
        this.buzzT = (this.buzzT || 0) - dt;
        if (this.buzzT <= 0) { this.buzzT = 0.12; g.audio.tone(95 + Math.random() * 10, 'sawtooth', 0.04, 0.14); if (cutNow) g.audio.burst(3000, 1, 0.03, 0.08); }
        if (this.mowing && this.mowProgress() >= 0.9 && !this.mowDoneMsg) { this.mowDoneMsg = true; g.say('Lawn done! Go tell Pertti.'); }
      }
    } else this.mowDoneMsg = false;
  }

  // map markers
  markers() {
    const g = this.game, out = [];
    if (this.parcels) for (const p of this.parcels.list) { const mb = g.mailboxes.find((m) => m.id === p.dest); if (mb && g.asm.get(p.uid)) out.push({ x: mb.pos.x, z: mb.pos.z, c: '#ffd040', t: 'Parcel: ' + mb.name }); }
    if (this.scrapKnown) for (const it of g.asm.items.values()) if (it.def.kind === 'scrap' && it.loc?.kind === 'world' && !it.loc.cont) out.push({ x: it.loc.pos[0], z: it.loc.pos[2], c: '#c07040', t: '' });
    return out;
  }
  // jobs you're on right now (for the phone's cancel buttons)
  active() {
    const a = [];
    if (this.parcels) a.push({ key: 'parcels', title: 'Parcel delivery' });
    if (this.workshop) a.push({ key: 'workshop', title: `Esa's workshop job (${this.workshop.title.toLowerCase()})` });
    if (this.mowing) a.push({ key: 'mowing', title: 'Mowing Pertti\'s lawn' });
    if (this.scrapActive) a.push({ key: 'scrap', title: 'Scrap metal collecting' });
    return a;
  }
  cancel(key) {
    const g = this.game, asm = g.asm;
    const drop = (u) => { const it = asm.get(u); if (!it) return; if (g.interaction.held === it) g.interaction.release(); if (it.loc?.kind === 'inv') g.inventory = g.inventory.filter((x) => x !== u); asm.remove(it); };
    if (key === 'parcels' && this.parcels) { for (const p of this.parcels.list) drop(p.uid); this.parcels = null; g.say('You called Helena: "Fine, I\'ll find someone else for those parcels."', 5); }
    if (key === 'workshop' && this.workshop) { for (const u of this.workshop.items) { const it = asm.get(u); if (it && !it.slot) drop(u); else if (it) { asm.uninstall?.(it, { silent: true }); drop(u); } } this.workshop = null; this.returnEsaTools?.(); g.say('You told Esa you can\'t finish the job. "Pfft. Fine. Ask again tomorrow."', 5); }
    if (key === 'mowing' && this.mowing) { this.mowing = null; if (g.player.pushing === this.mower) g.player.pushing = null; g.say('You told Pertti you won\'t mow the lawn after all.', 4); }
    if (key === 'scrap') { this.scrapActive = false; g.say('Stopped collecting scrap. (You can still sell scrap to Raimo any time.)', 4); }
    if (this.focus === key) this.focus = null;
    g.saveGame(true);
  }
  list() {
    const g = this.game, L = [];
    L.push({ title: 'Parcel delivery (post office, Ruskala)', status: this.parcels ? `${this.parcels.list.filter((p) => g.asm.get(p.uid)).length} parcels to deliver by ${g.life.fmtTime(this.parcels.deadline)}` : 'Ask Helena at the post office, 8–17', pay: '45–150 mk / parcel' });
    L.push({ title: 'Mow neighbour Pertti\'s lawn', status: this.mowing ? `${Math.round(this.mowProgress() * 100)}% mowed` : 'Talk to Pertti (farm west of your place)', pay: '180 mk / week' });
    L.push({ title: 'Scrap metal for Raimo\'s scrapyard', status: this.scrapKnown ? 'Collect junk around the parish and put it on the scale' : 'Ask Raimo or Mäkelä', pay: `${SCRAP_PRICE} mk/kg` });
    L.push({ title: 'Workshop jobs at Esa\'s garage', status: this.workshop ? `${this.workshop.title}: ${this.workshop.tasks.filter((t) => !this.taskDone(t)).length} tasks left` : 'Ask Esa, 8–18 (one job per day)', pay: '240–380 mk' });
    return L;
  }
  serialize() { return { focus: this.focus, scrapActive: this.scrapActive, parcels: this.parcels, mowing: this.mowing, cut: Array.from(this.mowCut).join(''), workshop: this.workshop, scrapKnown: this.scrapKnown, restockDay: this.restockDay, scrapSeeded: this.scrapSeeded, lastMowWeek: this.lastMowWeek, lastWorkshopDay: this.lastWorkshopDay }; }
  restore(d) {
    if (!d) return;
    Object.assign(this, { focus: d.focus || null, scrapActive: !!d.scrapActive, parcels: d.parcels, mowing: d.mowing, workshop: d.workshop, scrapKnown: d.scrapKnown, restockDay: d.restockDay ?? -1, scrapSeeded: d.scrapSeeded, lastMowWeek: d.lastMowWeek, lastWorkshopDay: d.lastWorkshopDay });
    if (d.cut) [...d.cut].forEach((c, i) => { if (i < this.tufts.length) this.setTuft(i, c === '1'); });
    this.relayoutWorkshop();
  }
}
