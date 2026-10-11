// Jobs: parcel deliveries, lawn mowing, scrap collection, workshop jobs; scrapyard used-part stock.
import * as THREE from 'three';
import { DEFS } from '../mechanics/partsdb.js';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { heightAt, nearestRoad, ROADS, ZONES } from '../world/terrain.js';
import { interact } from '../world/buildings.js';
import { mulberry32, fmtMoney, clamp } from '../core/util.js';

const SCRAP_PRICE = 1.4; // mk / kg

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
    if (this.parcels) { this.parcels.list = this.parcels.list.filter((p) => g.asm.get(p.uid)); if (!this.parcels.list.length) { this.parcels = null; g.say('All parcels delivered. Helena will be pleased.'); } }
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
      this.mowing = null;
      g.addMoney(pay, 'Mowed Pertti\'s lawn');
      g.ui.dialog('Pertti (neighbour)', 'Hmm. Not bad. Not bad at all. Here. Same again next week?', [{ label: 'Thanks', go: () => {} }]);
      this.lastMowWeek = Math.floor(g.life.day / 7);
      return;
    }
    if (this.mowing) { g.ui.dialog('Pertti (neighbour)', `You've done ${Math.round(this.mowProgress() * 100)}%. I said the WHOLE lawn. The mower is by the lawn.`, [{ label: 'OK', go: () => {} }]); return; }
    if (this.lastMowWeek === Math.floor(g.life.day / 7)) { g.ui.dialog('Pertti (neighbour)', 'The grass hasn\'t grown back yet. Come back next week.', [{ label: 'OK', go: () => {} }]); return; }
    g.ui.dialog('Pertti (neighbour)', 'My knees are no good. Mow the lawn by the house and I\'ll pay you 180 mk. The mower is the red thing.', [
      { label: 'Deal', go: () => { this.mowing = { active: true }; for (let i = 0; i < this.tufts.length; i++) this.setTuft(i, false); g.say('Push the mower over the lawn (E to grab it).'); } },
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
    this.scrapKnown = true;
    g.ui.dialog('Scrap metal', `Old junk lies in ditches and forest edges all over the parish. Raimo at the scrapyard (far west) pays ${SCRAP_PRICE} mk/kg on his scale. Heavy pieces need the car — put them in the boot. Spots are now marked on your map (M).`, [{ label: 'Got it', go: () => {} }]);
  }
  scaleItems() {
    const s = this.game.scrapScale;
    return [...this.game.asm.items.values()].filter((it) => it.loc?.kind === 'world' && !it.loc.cont && it.def.kind !== 'root' && Math.abs(it.loc.pos[0] - s.center.x) < s.half[0] && Math.abs(it.loc.pos[2] - s.center.z) < s.half[1]);
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
        this.workshop = null;
        g.addMoney(w.pay, `Workshop job for Esa: ${w.title}`);
        g.ui.dialog('Esa (mechanic)', `Let me check… torque is right, everything's there. Good work. ${w.pay} mk. Come back tomorrow, there's always something.`, [{ label: 'Thanks', go: () => {} }]);
        this.lastWorkshopDay = g.life.day;
        return;
      }
      g.ui.dialog('Esa (mechanic)', `${w.title}. Still to do: ${left.map((t) => t.label).join('; ')}. Everything you need is on my bench.`, [{ label: 'OK', go: () => {} }]);
      return;
    }
    if (this.lastWorkshopDay === g.life.day) { g.ui.dialog('Esa (mechanic)', 'Nothing more today. Come back tomorrow.', [{ label: 'OK', go: () => {} }]); return; }
    const variant = g.life.day % 2;
    const title = variant === 0 ? 'Finish rebuilding a customer\'s cylinder head' : 'Put a customer\'s gearbox back together';
    const pay = variant === 0 ? 380 : 240;
    g.ui.dialog('Esa (mechanic)', `I've got a job: ${title.toLowerCase()}. Bring your own tools or use mine on the bench. Pays ${pay} mk. Torque everything to spec.`, [
      { label: 'I\'ll do it', go: () => this.startWorkshop(variant, title, pay) },
      { label: 'Not today', go: () => {} },
    ]);
  }
  startWorkshop(variant, title, pay) {
    const g = this.game, asm = g.asm;
    const at = (dx, dz) => g.workshopBench.clone().add(new THREE.Vector3(dx, 0, dz));
    const items = [];
    const drop = (id, dx, dz, o) => { const it = asm.create(id, o); asm.dropAt(it, at(dx, dz), 0, null); items.push(it.uid); return it; };
    let tasks;
    if (variant === 0) {
      const head = drop('head_16', 0, 0, { cond: 0.9 });
      for (const [s, id] of [['valvesIn', 'valves_in'], ['valvesEx', 'valves_ex'], ['valveSprings', 'valve_springs'], ['retainers', 'valve_retainers'], ['camBearings', 'cam_bearings']]) asm.install(asm.create(id, { cond: 0.9 }), head, s, { fastened: true });
      const cam = asm.create('camshaft_std', { cond: 0.9 }); asm.install(cam, head, 'camshaft', { fastened: true, q: 0.2 });
      drop('rockers', 1.0, 0, { cond: 0.9 }); drop('valve_cover', -1.1, 0.05, { cond: 0.9 });
      for (let i = 0; i < 4; i++) drop('spark_plug', 0.7 + i * 0.12, 0.25);
      tasks = [{ host: head.uid, slot: 'camshaft', label: 'torque the cam cap bolts' }, { host: head.uid, slot: 'rockers', label: 'fit & torque the rockers' },
        ...[1, 2, 3, 4].map((i) => ({ host: head.uid, slot: 'plug' + i, label: `spark plug #${i}` })), { host: head.uid, slot: 'valveCover', label: 'valve cover' }];
    } else {
      const gb = drop('gearbox_4sp', 0, 0, { cond: 0.85, props: { oil: 0 } });
      asm.install(asm.create('gearset_std', { cond: 0.85 }), gb, 'gearset', { fastened: true });
      drop('gearbox_cover', 1.1, 0.1, { cond: 0.9 });
      drop('gear_oil', -1.1, 0.1, {});
      tasks = [{ host: gb.uid, slot: 'gbCover', label: 'fit & torque the bottom cover' }, { host: gb.uid, fluid: 'oil', min: 1.4, label: 'fill with 1.4 L gear oil' }];
    }
    this.workshop = { variant, title, pay, tasks, items };
    g.say('The job is on Esa\'s bench. Tab shows what\'s loose.');
  }
  taskDone(t) {
    const asm = this.game.asm, host = asm.get(t.host);
    if (!host) return false;
    if (t.fluid) return (host.props[t.fluid] || 0) >= t.min;
    const k = host.kids[t.slot];
    return !!k && asm.fastenerSummary(k).secure && asm.fastenerSummary(k).over === 0;
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.game;
    this.restockScrapyard();
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
  list() {
    const g = this.game, L = [];
    L.push({ title: 'Parcel delivery (post office, Ruskala)', status: this.parcels ? `${this.parcels.list.filter((p) => g.asm.get(p.uid)).length} parcels to deliver by ${g.life.fmtTime(this.parcels.deadline)}` : 'Ask Helena at the post office, 8–17', pay: '45–150 mk / parcel' });
    L.push({ title: 'Mow neighbour Pertti\'s lawn', status: this.mowing ? `${Math.round(this.mowProgress() * 100)}% mowed` : 'Talk to Pertti (farm west of your place)', pay: '180 mk / week' });
    L.push({ title: 'Scrap metal for Raimo\'s scrapyard', status: this.scrapKnown ? 'Collect junk around the parish and put it on the scale' : 'Ask Raimo or Mäkelä', pay: `${SCRAP_PRICE} mk/kg` });
    L.push({ title: 'Workshop jobs at Esa\'s garage', status: this.workshop ? `${this.workshop.title}: ${this.workshop.tasks.filter((t) => !this.taskDone(t)).length} tasks left` : 'Ask Esa, 8–18 (one job per day)', pay: '240–380 mk' });
    return L;
  }
  serialize() { return { parcels: this.parcels, mowing: this.mowing, cut: Array.from(this.mowCut).join(''), workshop: this.workshop, scrapKnown: this.scrapKnown, restockDay: this.restockDay, scrapSeeded: this.scrapSeeded, lastMowWeek: this.lastMowWeek, lastWorkshopDay: this.lastWorkshopDay }; }
  restore(d) {
    if (!d) return;
    Object.assign(this, { parcels: d.parcels, mowing: d.mowing, workshop: d.workshop, scrapKnown: d.scrapKnown, restockDay: d.restockDay ?? -1, scrapSeeded: d.scrapSeeded, lastMowWeek: d.lastMowWeek, lastWorkshopDay: d.lastWorkshopDay });
    if (d.cut) [...d.cut].forEach((c, i) => { if (i < this.tufts.length) this.setTuft(i, c === '1'); });
  }
}
