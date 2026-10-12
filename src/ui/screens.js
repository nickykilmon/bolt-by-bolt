// Extra screens: dialogue, stores, tuning, paint shop, service, garage services, jobs, phone.
import { UI } from './ui.js';
import { DEFS } from '../mechanics/partsdb.js';
import { EVENTS, STAGES } from '../racing/rally.js';
import { fmtMoney, clamp } from '../core/util.js';
import { TQ_PEAK, torqueShape } from '../vehicles/systems.js';
import { ACH } from '../economy/achievements.js';
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const P = UI.prototype;

P.dialog = function (title, text, options) {
  const el = $('dialog');
  const g = this.game;
  g.audio.speak(text, g.npcs ? g.npcs.voiceProfile(title) : {});
  el.innerHTML = `<div class="panel"><h2>${title}</h2><div class="say">“${text}”</div>${options.map((o, i) => `<button data-i="${i}">› ${o.label}</button>`).join('')}</div>`;
  el.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { const o = options[+b.dataset.i]; if (/^(Bye|OK|Thanks|Not now|Not today|Maybe later)/.test(o.label)) g.audio.hush(); this.closeModal(); setTimeout(() => o.go(), 0); });
  this.openModal('dialog');
};

P.panel = function (html, bind) {
  const el = $('panel');
  el.innerHTML = `<div class="panel wide">${html}<button id="pnClose" style="margin-top:10px">Close</button></div>`;
  $('pnClose').onclick = () => this.closeModal();
  bind?.(el);
  if (this.modal !== 'panel') this.openModal('panel');
};

// ---------- over-the-counter stores ----------
const STORE = {
  parts: { title: 'Rautaosa car parts store — over the counter', filter: (d) => d.shop && d.cat !== 'Groceries' && d.cat !== 'Leisure', where: (g) => g.partsCounter },
  grocery: { title: 'Village shop (groceries)', filter: (d) => (d.cat === 'Groceries' && d.shop) || d.id === 'fishing_rod', where: (g) => g.groceryCounter },
  kiosk: { title: 'Gas station kiosk', filter: (d) => ['sausage', 'coffee', 'milk', 'beer', 'cigarettes', 'fishing_rod', 'jerrycan', 'oil_jug', 'coolant_jug'].includes(d.id), where: (g) => g.kioskCounter, extra: [{ id: 'jerrycan_empty', name: 'Empty jerry can (10 L)', price: 45, make: 'jerrycan', amount: 0 }] },
};
P.openStore = function (kind) {
  const g = this.game, S = STORE[kind];
  const items = Object.values(DEFS).filter(S.filter).map((d) => ({ id: d.id, name: d.name, price: d.price, make: d.id, cat: d.cat }));
  for (const e of S.extra || []) items.push(e);
  const render = () => {
    let rows = '';
    let cat = null;
    for (const it of items) {
      if (it.cat && it.cat !== cat) { cat = it.cat; rows += `<div style="grid-column:1/4;color:#f2c14e;margin-top:6px">${cat}</div>`; }
      rows += `<div>${it.name}</div><div>${fmtMoney(it.price)}</div><div><button data-buy="${it.id}">Buy</button></div>`;
    }
    this.panel(`<h2>${S.title}</h2><div class="muted">Money: <b>${fmtMoney(g.money)}</b>. Items are put on the counter.</div><div class="store-grid">${rows}</div>`, (el) => {
      el.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => {
        const it = items.find((x) => x.id === b.dataset.buy);
        if (g.money < it.price) { this.toast('Not enough money'); g.audio.clink(); return; }
        g.addMoney(-it.price, `Bought ${it.name}`);
        const inst = g.asm.create(it.make, it.amount !== undefined ? { amount: it.amount } : {});
        if (it.amount !== undefined) inst.props.amount = it.amount;
        const at = S.where(g).clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 0.25));
        g.asm.dropAt(inst, at, Math.random() * 6, null);
        render();
      });
    });
  };
  render();
};

// ---------- tuning ----------
P.tuningLocation = function () {
  const g = this.game, c = g.car.chassis.obj.position;
  const spots = [[new THREE.Vector3(-1, 0, 0), 14, 'home garage'], [new THREE.Vector3(482, 0, 104), 16, 'gas station'], [g.servicePark, 30, 'service park'], [new THREE.Vector3(596, 0, 112), 16, 'Esa\'s workshop']];
  for (const [p, r, n] of spots) if (Math.hypot(c.x - p.x, c.z - p.z) < r) return n;
  return null;
};
P.openTuning = function () {
  const g = this.game, car = g.car, ch = car.chassis.kids;
  const where = this.tuningLocation();
  if (!where) { g.say('The car needs to be at the garage, the gas station air pump, Esa\'s or the service park for setup work.'); return; }
  const rows = [];
  const add = (label, inst, key, min, max, step, def, fmt, note) => { if (inst) rows.push({ label, inst, key, min, max, step, def, fmt, note }); };
  for (const c of ['FL', 'FR', 'RL', 'RR']) add(`Tyre pressure ${c}`, ch['wheel' + c], 'pressure', 1.2, 3.0, 0.05, 2.0, (v) => v.toFixed(2) + ' bar', 'Low = more grip on gravel but sluggish & wears; high = twitchy');
  add('Front toe (tie rods)', ch.tieRodFL, 'toe', -0.03, 0.03, 0.002, 0, (v) => (v * 57.3).toFixed(1) + '°', 'Toe-out sharpens turn-in, toe-in is stable');
  for (const [a, k] of [['Front', 'FL'], ['Rear', 'RL']]) add(`${a} ride height (spring preload)`, ch['spring' + k], 'preload', -0.04, 0.06, 0.005, 0, (v) => (v * 100).toFixed(1) + ' cm', 'Higher = more clearance for rough stages');
  for (const [a, k] of [['Front', 'FL'], ['Rear', 'RL']]) { const s = ch['shock' + k]; if (s && (s.props.damp || 1) > 1) add(`${a} damper clicks`, s, 'clicks', 0, 10, 1, 5, (v) => v.toFixed(0), 'Adjustable gravel dampers only'); }
  add('Brake bias (front)', ch.masterCyl, 'bias', 0.5, 0.78, 0.01, 0.64, (v) => Math.round(v * 100) + '%', 'More rear = rotates under braking');
  if (ch.diff && ch.diff.props.lock > 0) add('Diff locking (LSD)', ch.diff, 'lock', 0.2, 0.95, 0.05, 0.6, (v) => Math.round(v * 100) + '%', 'More lock = traction, less turn-in');
  const carb = ch.engine?.kids.head?.kids.intake?.kids.carb, dist = ch.engine?.kids.head?.kids.distributor;
  add('Carburettor mixture', carb, 'mixture', -1, 1, 0.05, 0, (v) => (v < -0.05 ? 'lean ' : v > 0.05 ? 'rich ' : 'stoich ') + v.toFixed(2), 'Lean runs hot and pings; rich wastes fuel. Best power slightly lean.');
  add('Idle speed screw', carb, 'idle', 650, 1300, 25, 850, (v) => v.toFixed(0) + ' rpm');
  add('Ignition advance', dist, 'advance', -6, 14, 0.5, 0, (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '°', 'More power up to ~+8°, beyond that detonation damages pistons');
  const S = car.systems();
  const gs = ch.engine?.kids.gearbox?.kids.gearset;
  const info = () => {
    const S2 = car.systems();
    let h = `<div class="muted">Engine output: <b>${Math.round(S2.powerMult * S2.quality / 0.82 * 100)}%</b> of a healthy stock engine · fuel use ×${(S2.fuelMult || 1).toFixed(2)} · ${S2.knockRisk > 0 ? '<span style="color:#ff9a8a">detonation risk</span>' : 'no detonation risk'}</div>`;
    if (gs) h += `<div class="muted">Gear set: ${gs.def.name}. Top speed by gear @6500 rpm: ${gs.props.ratios.map((r, i) => `${i + 1}: ${Math.round(6500 * Math.PI / 30 / (r * gs.props.final) * 0.3 * 3.6)}`).join(', ')} km/h. Swap gear sets / differentials for other ratios.</div>`;
    return h;
  };
  const html = () => `<h2>Setup — ${where}</h2><div class="muted">Changes apply immediately. Hold Tab in the garage to see alignment and pressure warnings.</div>
    ${rows.map((r, i) => `<div class="tune-row"><div>${r.label}${r.note ? `<div class="muted">${r.note}</div>` : ''}</div><input type="range" data-i="${i}" min="${r.min}" max="${r.max}" step="${r.step}" value="${r.inst.props[r.key] ?? r.def}"><div id="tv${i}">${r.fmt(r.inst.props[r.key] ?? r.def)}</div></div>`).join('')}
    <div id="tuneInfo">${info()}</div><button id="tuneReset">Reset to standard</button>`;
  this.panel(html(), (el) => {
    el.querySelectorAll('input[type=range]').forEach((inp) => inp.oninput = () => {
      const r = rows[+inp.dataset.i]; const v = +inp.value;
      if (r.key === 'toe') { ch.tieRodFL.props.toe = v; if (ch.tieRodFR) ch.tieRodFR.props.toe = v; }
      else if (r.key === 'preload') { const front = r.label.startsWith('Front'); for (const k of front ? ['FL', 'FR'] : ['RL', 'RR']) if (ch['spring' + k]) ch['spring' + k].props.preload = v; }
      else if (r.key === 'clicks') { const front = r.label.startsWith('Front'); for (const k of front ? ['FL', 'FR'] : ['RL', 'RR']) if (ch['shock' + k]) ch['shock' + k].props.clicks = v; }
      else r.inst.props[r.key] = v;
      $('tv' + inp.dataset.i).textContent = r.fmt(v);
      g.asm.changed();
      $('tuneInfo').innerHTML = info();
    });
    $('tuneReset').onclick = () => { for (const r of rows) { if (['toe', 'preload', 'clicks'].includes(r.key)) { for (const k of ['FL', 'FR', 'RL', 'RR']) { const p = ch[(r.key === 'toe' ? 'tieRod' : r.key === 'preload' ? 'spring' : 'shock') + k]; if (p) delete p.props[r.key]; } } else delete r.inst.props[r.key]; if (r.key === 'pressure') r.inst.props.pressure = 2.0; } g.asm.changed(); this.openTuning(); };
  });
};

// ---------- paint shop ----------
const COLORS = ['#c4a25a', '#b01818', '#1a3a8a', '#f2f2ee', '#151515', '#2a6a3a', '#e8a020', '#5a2a7a', '#3a8ac8', '#8a8a86', '#d86a1a', '#e8d020'];
P.openPaint = function () {
  const g = this.game, P0 = g.car.chassis.props;
  const c = g.car.chassis.obj.position;
  if (Math.hypot(c.x - 596, c.z - 112) > 18) { g.say('Tuula: "Bring the car into the workshop first."'); return; }
  const sel = { paint: P0.paint || '#c4a25a', stripe: P0.stripe || '#ffffff', livery: P0.livery || 'none', number: P0.number || '', mudflaps: !!P0.mudflaps };
  const cost = () => (sel.paint !== (P0.paint || '#c4a25a') ? 900 : 0) + (sel.livery !== (P0.livery || 'none') || sel.stripe !== (P0.stripe || '#ffffff') ? 350 : 0) + (String(sel.number) !== String(P0.number || '') ? 60 : 0) + (sel.mudflaps !== !!P0.mudflaps ? 140 : 0);
  const render = () => {
    this.panel(`<h2>Paint shop — paint & livery</h2>
      <div>Body colour</div><div class="swatches">${COLORS.map((c2) => `<button data-c="${c2}" class="${sel.paint === c2 ? 'on' : ''}" style="background:${c2}"></button>`).join('')} <input type="color" id="pcCustom" value="${sel.paint}"></div>
      <div style="margin-top:8px">Stripe / decal colour</div><div class="swatches">${COLORS.map((c2) => `<button data-s="${c2}" class="${sel.stripe === c2 ? 'on' : ''}" style="background:${c2}"></button>`).join('')}</div>
      <label style="margin-top:8px">Livery <select id="pcLiv">${[['none', 'Plain'], ['stripes', 'Twin racing stripes'], ['side', 'Side stripes'], ['rally', 'Full rally livery + sponsors'], ['checker', 'Checkered roof']].map(([v, n]) => `<option value="${v}" ${sel.livery === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Race number <input id="pcNum" type="number" min="0" max="99" value="${sel.number}" style="width:70px"></label>
      <label><input type="checkbox" id="pcMud" ${sel.mudflaps ? 'checked' : ''}> Rally mud flaps</label>
      <div style="margin-top:8px">Price: <b>${fmtMoney(cost())}</b> (paint 900, livery 350, number 60, mud flaps 140) · takes 3 hours</div>
      <button id="pcGo" ${cost() ? '' : 'disabled'}>Paint it!</button>`, (el) => {
      el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { sel.paint = b.dataset.c; render(); });
      el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { sel.stripe = b.dataset.s; render(); });
      $('pcCustom').oninput = (e) => { sel.paint = e.target.value; };
      $('pcCustom').onchange = () => render();
      $('pcLiv').onchange = (e) => { sel.livery = e.target.value; render(); };
      $('pcNum').onchange = (e) => { sel.number = e.target.value ? clamp(+e.target.value, 0, 99) : ''; render(); };
      $('pcMud').onchange = (e) => { sel.mudflaps = e.target.checked; render(); };
      $('pcGo').onclick = () => {
        const price = cost();
        if (g.money < price) { this.toast('Not enough money'); return; }
        g.addMoney(-price, 'Paint shop');
        Object.assign(P0, sel);
        this.closeModal();
        g.fade(() => { g.life.skip(180); g.car.applyCosmetics(); g.say('Tuula: "There. Now it at least LOOKS fast."'); });
      };
    });
  };
  render();
};

// ---------- service (service park crew / Esa) ----------
P.serviceItems = function () {
  const g = this.game, ch = g.car.chassis.kids, asm = g.asm, out = [];
  const body = ['hood', 'doorL', 'doorR', 'trunk', 'bumperF', 'bumperR', 'headlightL', 'headlightR', 'taillightL', 'taillightR', 'lightPod', 'splitter', 'skirtL', 'skirtR'].map((k) => ch[k]).filter((p) => p && (p.cond < 0.85 || p.props.dents?.length));
  if (body.length) out.push({ label: `Repair body panels & lights (${body.length})`, cost: Math.round(body.reduce((s, p) => s + (1 - p.cond) * p.def.price * 0.5, 0)), min: 30, go: () => body.forEach((p) => { p.cond = 1; p.props.dents = []; asm.buildVisual(p); asm.applyOpen(p); }) });
  const sd = g.car.chassis.props.shellDents?.length || 0;
  if (sd) out.push({ label: `Panel-beat the dented body shell (${sd} dent${sd > 1 ? 's' : ''})`, cost: 70 + sd * 45, min: 20 + sd * 10, go: () => g.car.repairShell() });
  const bent = ['controlArmFL', 'controlArmFR', 'tieRodFL', 'tieRodFR'].map((k) => ch[k]).filter((p) => p && Math.abs(p.props.bent || 0) > 0.003);
  if (bent.length) out.push({ label: 'Straighten suspension & alignment', cost: 220, min: 30, go: () => bent.forEach((p) => { p.props.bent = 0; }) });
  const tyres = ['FL', 'FR', 'RL', 'RR'].map((k) => ch['wheel' + k]).filter((p) => p && p.cond < 0.6);
  if (tyres.length) out.push({ label: `New tyres (${tyres.length})`, cost: tyres.length * 160, min: 15 * tyres.length, go: () => tyres.forEach((p) => { p.cond = 1; asm.buildVisual(p); }) });
  const pads = ['FL', 'FR', 'RL', 'RR'].map((k) => ch['pads' + k]).filter((p) => p && p.cond < 0.5);
  if (pads.length) out.push({ label: `Brake pads (${pads.length} corners)`, cost: pads.length * 110, min: 10 * pads.length, go: () => pads.forEach((p) => { p.cond = 1; }) });
  const shocks = ['FL', 'FR', 'RL', 'RR'].map((k) => ch['shock' + k]).filter((p) => p && p.cond < 0.5);
  if (shocks.length) out.push({ label: `Rebuild shock absorbers (${shocks.length})`, cost: shocks.length * 180, min: 20 * shocks.length, go: () => shocks.forEach((p) => { p.cond = 0.95; }) });
  if (ch.radiator && ch.radiator.cond < 0.6) out.push({ label: 'Repair radiator', cost: 170, min: 25, go: () => { ch.radiator.cond = 0.95; } });
  const S = g.car.systems();
  const needF = (S.oil < 3.6 && S.block && S.oilLeak < 1) || (S.coolant < 5.8 && S.coolLeak < 1) || S.brakeFluid < 0.45 || (S.gearbox && S.gearOil < 1.5);
  if (needF) out.push({ label: 'Top up all fluids', cost: 110, min: 10, go: () => { if (S.block && S.oilLeak < 1) S.block.props.oil = 3.8; if (S.coolLeak < 1) g.car.chassis.props.coolant = 6; if (ch.masterCyl) ch.masterCyl.props.fluid = 0.5; if (S.gearbox && S.gearbox.kids.gbCover) S.gearbox.props.oil = 1.6; } });
  if (ch.oilPan?.cond < 0.4 || ch.engine?.kids.oilPan?.cond < 0.4) out.push({ label: 'Hammer out the dented sump', cost: 90, min: 20, go: () => { ch.engine.kids.oilPan.cond = 0.8; } });
  return out;
};
P.openService = function (title = 'Service park — Ari\'s crew') {
  const g = this.game;
  const c = g.car.chassis.obj.position;
  const near = Math.hypot(c.x - g.servicePark.x, c.z - g.servicePark.z) < 30 || Math.hypot(c.x - 596, c.z - 112) < 18;
  if (!near) { g.say('Bring the car to the service park (or Esa\'s workshop) first.'); return; }
  const render = () => {
    const items = this.serviceItems();
    this.panel(`<h2>${title}</h2><div class="muted">Each job takes game time — during an event it eats into your liaison time.</div>
      ${items.length ? items.map((it, i) => `<div class="svc"><span>${it.label} <span class="muted">(${it.min} min)</span></span><span>${fmtMoney(it.cost)} <button data-i="${i}">Do it</button></span></div>`).join('') : '<div style="margin:10px 0">Nothing obvious to fix. The car is in decent shape!</div>'}`, (el) => {
      el.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
        const it = items[+b.dataset.i];
        if (g.money < it.cost) { this.toast('Not enough money'); return; }
        g.addMoney(-it.cost, it.label); it.go(); g.life.skip(it.min); g.asm.changed(); g.audio.ratchet('ratchet'); render();
      });
    });
  };
  render();
};
// ---------- dyno ----------
P.openDyno = function () {
  const g = this.game, c = g.car.chassis.obj.position;
  if (Math.hypot(c.x - 596, c.z - 112) > 20) { g.say('Esa: "Bring the car to the workshop first. The dyno doesn\'t do house calls."'); return; }
  const S = g.car.systems();
  if (!S.canRotate || !S.fuelOk || S.quality < 0.18 || !S.drive) { g.say('Esa: "It has to run and drive before I strap it to the rollers."'); return; }
  if (g.money < 60) { this.toast('Not enough money'); return; }
  g.addMoney(-60, 'Dyno run at Esa\'s');
  const pts = [];
  let peakHp = 0, peakHpRpm = 0, peakTq = 0, peakTqRpm = 0;
  for (let rpm = 1000; rpm <= 6600; rpm += 100) {
    const boost = S.boost * clamp((rpm - 2400) / 1600, 0, 1);
    const tq = TQ_PEAK * torqueShape(rpm) * S.powerMult * (S.quality / 0.82) * (1 - S.vacuumLeak * 0.4) * (1 + boost * 1.6) * 0.85; // at the wheels
    const hp = tq * rpm / 7022;
    pts.push({ rpm, tq, hp });
    if (hp > peakHp) { peakHp = hp; peakHpRpm = rpm; } if (tq > peakTq) { peakTq = tq; peakTqRpm = rpm; }
  }
  g.stats = g.stats || {}; g.stats.bestHp = Math.max(g.stats.bestHp || 0, peakHp);
  g.ach?.check('dyno', peakHp);
  this.panel(`<h2>Dyno sheet — Ruska 1600</h2>
    <div>Peak <b style="color:#f2c14e">${Math.round(peakHp)} hp</b> @ ${peakHpRpm} rpm · <b style="color:#6ab0ff">${Math.round(peakTq)} Nm</b> @ ${peakTqRpm} rpm <span class="muted">(at the wheels)</span></div>
    <canvas id="dynoC" width="640" height="300" style="background:#111;margin-top:8px;border:1px solid #444"></canvas>
    <div class="muted">${S.boost ? `Turbo: up to ${(S.boost).toFixed(2)} bar boost above ~4000 rpm. ` : ''}${S.firing < 4 ? `Only ${S.firing} of 4 cylinders firing! ` : ''}${S.vacuumLeak > 0.1 ? 'Vacuum leak is costing power. ' : ''}Esa: "${peakHp > 150 ? 'That\'s a proper rally engine.' : peakHp > 100 ? 'Not bad for a Ruska.' : 'My lawnmower has more. Get some parts on it.'}"</div>`, (el) => {
    const cv = el.querySelector('#dynoC'), x = cv.getContext('2d'), W = cv.width, H = cv.height, L = 46, B = 30;
    const maxV = Math.max(peakHp, peakTq) * 1.15;
    x.strokeStyle = '#333'; x.fillStyle = '#888'; x.font = '12px Arial';
    for (let r = 1000; r <= 6600; r += 1000) { const px = L + (r - 1000) / 5600 * (W - L - 10); x.beginPath(); x.moveTo(px, 10); x.lineTo(px, H - B); x.stroke(); x.fillText(r, px - 14, H - 10); }
    for (let v = 0; v <= maxV; v += 25) { const py = H - B - v / maxV * (H - B - 10); x.beginPath(); x.moveTo(L, py); x.lineTo(W - 10, py); x.stroke(); x.fillText(v, 8, py + 4); }
    const line = (key, col) => { x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); pts.forEach((p, i) => { const px = L + (p.rpm - 1000) / 5600 * (W - L - 10), py = H - B - p[key] / maxV * (H - B - 10); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); };
    line('tq', '#6ab0ff'); line('hp', '#f2c14e');
    x.fillStyle = '#f2c14e'; x.fillText('hp', W - 40, 24); x.fillStyle = '#6ab0ff'; x.fillText('Nm', W - 40, 40);
  });
  g.audio.ratchet('ratchet');
};
P.openGarageServices = function () {
  const g = this.game;
  this.panel(`<h2>Esa's garage — services</h2>
    <div class="svc"><span>Repairs & maintenance (car must be at the workshop)</span><button id="gsRep">Open</button></div>
    <div class="svc"><span>Tow my car to the workshop</span><span>${fmtMoney(200)} <button id="gsTowS">Call</button></span></div>
    <div class="svc"><span>Tow my car home</span><span>${fmtMoney(250)} <button id="gsTowH">Call</button></span></div>
    <div class="svc"><span>Setup / tuning (car at the workshop)</span><button id="gsTune">Open</button></div>
    <div class="svc"><span>Dyno run — measure your horsepower (car at the workshop)</span><span>${fmtMoney(60)} <button id="gsDyno">Run</button></span></div>`, () => {
    $('gsDyno').onclick = () => this.openDyno();
    $('gsRep').onclick = () => this.openService('Esa\'s repairs');
    $('gsTowS').onclick = () => g.towCar('shop');
    $('gsTowH').onclick = () => g.towCar('home');
    $('gsTune').onclick = () => this.openTuning();
  });
};

// ---------- jobs board ----------
P.openJobs = function () {
  const g = this.game;
  this.panel(`<h2>Notice board — jobs</h2>${g.jobs.list().map((j) => `<div class="svc"><span><b>${j.title}</b><div class="muted">${j.status}</div></span><span>${j.pay}</span></div>`).join('')}
    <div class="muted" style="margin-top:8px">Fuel is 7,90 mk/L at Kaasu-Kalle. Raimo's scrapyard sells used parts that change every day — condition unknown until you inspect them.</div>`);
};

// ---------- rally (HQ) ----------
P.openRally = function () {
  const g = this.game, R = g.rally;
  const act = R.active ? R.ev(R.active.evId) : null;
  this.panel(`<h2>Rally HQ — events & championship</h2>
    <div style="font-size:16px;margin-bottom:6px">🏁 Rally day is every <b>Saturday</b>. Next rally: <b style="color:#f2c14e">${R.rallyDayText()}</b>. Enter any day before then; on rally day the stages are open from 10:00 and rally cars race on every road.</div>
    <div>Reputation <b>${R.rep}</b> · Points <b>${R.points}</b> · Inspection: ${(g.car.chassis.props.inspected ?? -1) >= g.life.day ? `<span style="color:#9fe39a">valid until day ${g.car.chassis.props.inspected + 1}</span>` : '<span style="color:#ff9a8a">not valid</span>'}</div>
    ${act ? `<div class="svc"><span>Current: <b>${act.name}</b> — next SS${R.active.idx + 1} ${STAGES[R.nextStageId()].name}, due ${g.life.fmtTime(R.active.due)}. Times so far: ${R.active.times.map((t) => R.fmt(t)).join(', ') || '—'}</span><button id="rlRetire">Retire</button></div>` : ''}
    <table class="keys" style="width:100%">${EVENTS.map((ev) => { const bad = R.eligibility(ev); return `<tr><td><b>T${ev.tier} ${ev.name}</b><div class="muted">${ev.desc}<br>Stages: ${ev.stages.map((s) => STAGES[s].name).join(' → ')}</div>${bad.length ? `<div style="color:#ff9a8a;font-size:12px">${bad.join('<br>')}</div>` : ''}</td><td>${fmtMoney(ev.fee)}</td><td class="muted">${ev.prizes.map(fmtMoney).join(' / ')}</td><td>${!bad.length && !R.active ? `<button data-e="${ev.id}">Enter</button>` : ''}</td></tr>`; }).join('')}</table>
    <h2 style="margin-top:10px">Championship standings</h2><table class="keys">${R.standings().map((r, i) => `<tr style="${r.me ? 'color:#f2c14e;font-weight:bold' : ''}"><td>${i + 1}.</td><td>${r.name}</td><td>${r.p}</td></tr>`).join('')}</table>
    <h2 style="margin-top:10px">Stage records (practice any time from a START arch)</h2><div class="muted">${Object.entries(STAGES).map(([id, s]) => `${s.name}: ${R.best[id] ? R.fmt(R.best[id]) : '—'}`).join(' · ')}</div>`, (el) => {
    el.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => { R.enter(b.dataset.e); this.openRally(); });
    const rt = $('rlRetire'); if (rt) rt.onclick = () => { R.retire(); this.openRally(); };
  });
};

// ---------- phone ----------
P.openPhone = function () {
  const g = this.game, R = g.rally;
  const el = $('panel');
  el.innerHTML = `<div class="phone"><h2>📱 Nokla 2110</h2>
    <div>${g.life.dayName()} ${g.life.clock()} · ${fmtMoney(g.money)}</div>
    <div><b>Jobs</b>${g.jobs.list().map((j) => `<div class="muted">• ${j.title}: ${j.status}</div>`).join('')}</div>
    ${g.jobs.active().map((j) => `<button class="small" data-cancel="${j.key}">✖ Cancel job: ${j.title}</button>`).join('')}
    <div><b>Rally</b><div class="muted">${R.active ? R.hud() : 'No event entered.'}<br>Next rally day: ${R.rallyDayText()}</div></div>
    <button id="phTowH">Call tow truck → home (250 mk)</button>
    <button id="phTowS">Call tow truck → Esa's workshop (200 mk)</button>
    <button id="phTaxi">Call taxi home (60 mk)</button>
    <button id="phShop">Order parts (delivery)</button>
    <button id="phRally">Rally events</button>
    <button id="phProfile">My profile (name &amp; face)</button>
    <button id="phAch">🏆 Achievements (${g.ach.count()} / ${ACH.length})</button>
    <button id="phClose">Hang up</button></div>`;
  $('phTowH').onclick = () => g.towCar('home');
  $('phTowS').onclick = () => g.towCar('shop');
  $('phTaxi').onclick = () => g.taxiHome();
  $('phShop').onclick = () => this.openComputer('shop');
  $('phRally').onclick = () => this.openRally();
  $('phProfile').onclick = () => g.openProfile();
  $('phAch').onclick = () => this.panel(`<h2>🏆 Achievements — ${g.ach.count()} / ${ACH.length}</h2><div class="ach-list">${ACH.map((a) => `<div class="ach-row ${g.ach.got[a.id] !== undefined ? 'got' : ''}"><span class="ach-i">${g.ach.got[a.id] !== undefined ? a.icon : '🔒'}</span><div><b>${a.title}</b><div class="muted">${a.desc}</div></div></div>`).join('')}</div>`);
  $('phClose').onclick = () => this.closeModal();
  el.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => {
    const key = b.dataset.cancel, j = g.jobs.active().find((x) => x.key === key);
    this.dialog('Cancel job?', `Give up on: ${j.title}? You won't be paid for it${key === 'parcels' ? ' and the parcels go back to the post office' : ''}.`, [
      { label: 'Yes, cancel it', go: () => { g.jobs.cancel(key); } },
      { label: 'No, keep going', go: () => {} },
    ]);
  });
  this.openModal('panel');
};
