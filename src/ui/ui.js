// HUD, overlays and menus (DOM based).
import { DEFS, slotById, HOSTS, SIZE_LABEL } from '../mechanics/partsdb.js';
import { fmtMoney, clamp } from '../core/util.js';
import { ROADS, LAKE } from '../world/terrain.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.el = { prompt: $('prompt'), cross: $('crosshair'), sub: $('subtitle'), held: $('held'), toasts: $('toasts'), torque: $('torque'), needs: $('needs'), clock: $('clock'), drive: $('drivehud'), diag: $('diag'), part: $('partinfo'), dbg: $('debug') };
    this.subT = 0;
    this.modal = null;
    this.lastPrompt = '';
  }

  // ---------- HUD ----------
  prompt(html, active) {
    if (html !== this.lastPrompt) { this.el.prompt.innerHTML = html; this.lastPrompt = html; }
    this.el.cross.classList.toggle('active', !!active);
  }
  say(text, secs = 4.5) { this.el.sub.textContent = text; this.el.sub.style.opacity = 1; this.subT = secs; }
  toast(text, secs = 3) {
    const d = document.createElement('div'); d.textContent = text; this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), secs * 1000);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild.remove();
  }
  torque(t) {
    if (!t) { this.el.torque.classList.add('hidden'); return; }
    this.el.torque.classList.remove('hidden');
    const max = t.strip;
    const fill = this.el.torque.querySelector('.fill'), spec = this.el.torque.querySelector('.spec'), lbl = this.el.torque.querySelector('.lbl');
    fill.style.width = (clamp(t.q / max, 0, 1) * 100) + '%';
    fill.style.background = t.q > t.over ? '#e05030' : t.q >= t.ok ? '#70d070' : '#e0c060';
    spec.style.left = (t.ok / max * 100) + '%'; spec.style.width = ((t.over - t.ok) / max * 100) + '%';
    if (t.exact) lbl.textContent = `${Math.round(t.q * t.spec)} / ${t.spec} Nm`;
    else lbl.textContent = t.q < 0.05 ? 'finger tight' : t.q < t.ok ? 'snugging up…' : t.q <= 1.05 ? 'feels right' : t.q <= t.over ? 'pretty tight' : 'way too tight!';
  }
  partInfo(inst) {
    const el = this.el.part;
    if (!inst) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const asm = this.game.asm;
    const d = inst.def;
    let h = `<h3>${d.name}</h3>`;
    h += `<div>Mass ${asm.subtreeMass(inst).toFixed(1)} kg · Value ~${fmtMoney(d.price * (0.3 + 0.6 * inst.cond))}</div>`;
    if (d.kind === 'part') h += `<div>Condition: ${inst.known ? `<span class="${inst.cond < 0.35 ? 'bad' : 'ok'}">${Math.round(inst.cond * 100)}%</span>` : 'unknown — inspect it (hold RMB)'}</div>`;
    if (d.type === 'fluid') h += `<div>Contents: ${inst.props.amount.toFixed(2)} / ${d.cap} L</div>`;
    if (d.desc) h += `<div style="margin-top:4px;color:#ccc">${d.desc}</div>`;
    if (d.kind === 'part') h += `<div style="margin-top:4px">Fits: Ruska 1600 (${d.type.replace(/_/g, ' ')})</div>`;
    if (d.host && HOSTS[d.host]) {
      h += '<div style="margin-top:6px">';
      for (const s of HOSTS[d.host]) h += `<div>${inst.kids[s.id] ? '<span class="ok">✔</span>' : '<span class="bad">✖</span>'} ${s.name}</div>`;
      h += '</div>';
    }
    if (inst.props.tooth !== undefined) h += `<div>Timing mark: ${inst.props.tooth === 0 ? 'aligned' : inst.props.tooth + ' teeth off'}</div>`;
    if (d.props?.ratios) h += `<div>Ratios: ${d.props.ratios.join(' / ')} · final ${d.props.final}</div>`;
    if (inst.props.bent) h += `<div class="bad">Bent!</div>`;
    el.innerHTML = h;
  }

  diagnostics(show) {
    const el = this.el.diag;
    if (!show) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const g = this.game, car = g.car, S = car.systems();
    const near = g.diagFocus();
    let h = '';
    if (near === 'stand') {
      const b = g.stand.kids.engine;
      h += `<h3>Engine stand</h3>`;
      if (!b) h += '<div class="warn">Empty</div>';
      else h += this.hostTree(b, 0, 26) + `<div>Oil in engine: ${(b.props.oil || 0).toFixed(1)} L</div>`;
    } else {
      h += `<h3>Ruska 1600 — diagnosis</h3>`;
      const sev = ['ok', 'warn', 'warn', 'bad'];
      const list = S.issues.slice(0, 22);
      if (!list.length) h += '<div class="ok">No problems found. Time to drive!</div>';
      for (const i of list) h += `<div class="${sev[i.sev]}">${i.sev >= 3 ? '✖' : '⚠'} ${i.text}</div>`;
      if (S.issues.length > 22) h += `<div class="warn">…and ${S.issues.length - 22} more</div>`;
      h += `<h3>Fluids</h3><div>Oil ${(S.oil).toFixed(1)}/3.8 L · Coolant ${S.coolant.toFixed(1)}/6 L · Fuel ${S.fuel.toFixed(1)} L · Brake ${S.brakeFluid.toFixed(2)} L · Gear oil ${S.gearOil.toFixed(1)} L</div>`;
      h += `<div>Battery ${Math.round(S.battery.charge * 100)}%${S.battery.connected ? '' : ' (disconnected)'}</div>`;
      if (S.block) {
        const cam = S.head?.kids.camSprocket, cr = S.block.kids.crankSprocket;
        if (!S.block.kids.timingBelt && cam && cr) h += `<div>Timing marks: cam ${cam.props.tooth ? cam.props.tooth + ' off' : 'aligned'}, crank ${cr.props.tooth ? cr.props.tooth + ' off' : 'aligned'}</div>`;
        h += `<div>Compression: ${S.cyl.map((c) => Math.round(c.comp * 100)).join(' / ')}%</div>`;
      }
    }
    h += `<div style="margin-top:6px;color:#999">Fasteners: <span class="ok">■</span> tight <span class="warn">■</span> loose <span class="bad">■</span> missing</div>`;
    el.innerHTML = h;
  }
  hostTree(inst, depth, max) {
    let h = ''; let n = 0;
    const walk = (it, d) => {
      for (const s of HOSTS[it.def.host] || []) {
        if (n++ > max) return;
        const k = it.kids[s.id];
        const sum = k ? this.game.asm.fastenerSummary(k) : null;
        h += `<div style="padding-left:${d * 10}px" class="${k ? (sum.secure ? 'ok' : 'warn') : 'bad'}">${k ? (sum.secure ? '✔' : '⚠') : '✖'} ${s.name}${k && !sum.secure ? ' (not tight)' : ''}</div>`;
        if (k && k.def.host && d < 1) walk(k, d + 1);
      }
    };
    walk(inst, depth);
    return h;
  }

  hud(dt) {
    const g = this.game, L = g.life;
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.sub.style.opacity = 0; }
    const bar = (n, v, inv) => `<div class="n ${(inv ? v > 75 : v < 25) ? 'low' : ''}">${n}<div class="b"><div style="width:${clamp(v, 0, 100)}%"></div></div></div>`;
    this.el.needs.innerHTML = bar('Hunger', L.hunger) + bar('Thirst', L.thirst) + bar('Energy', 100 - L.fatigue);
    this.el.clock.innerHTML = `${L.dayName()} ${L.clock()}<br><b>${fmtMoney(g.money)}</b>`;
    const h = g.interaction.held;
    this.el.held.innerHTML = h ? `${h.def.name}${(h.def.type === 'ratchet' || h.def.type === 'torque_wrench') ? ` · ${h.props.socket ? h.props.socket + ' mm socket' : 'no socket'}` : ''}${h.def.type === 'fluid' ? ` · ${h.props.amount.toFixed(1)} L` : ''}<br><span style="opacity:.7">G put down · Q pocket</span>` : '';
    // drive HUD
    if (g.player.inCar) {
      const pt = g.car.pt;
      this.el.drive.classList.remove('hidden');
      const gear = pt.gear === -1 ? 'R' : pt.gear === 0 ? 'N' : pt.gear;
      this.el.drive.innerHTML = `${Math.round(g.car.speed * 3.6)} km/h · ${Math.round(pt.rpm)} rpm · ${gear}<br>` +
        `<span style="opacity:.7">T ignition (hold: start) · Shift clutch · R/F or wheel: gears · Space handbrake · L lights · E exit</span>` +
        (pt.ign ? '' : '<br><span style="opacity:.8">Ignition OFF</span>') + (g.rally.hud() ? `<br><b style="color:#ffd070;font-size:16px">${g.rally.hud()}</b>` : '');
    } else this.el.drive.classList.add('hidden');
  }

  debug(text) { this.el.dbg.textContent = text; }

  // ---------- modals ----------
  openModal(id) {
    this.closeModal();
    this.modal = id;
    $(id).classList.remove('hidden');
    this.game.input.unlock();
  }
  closeModal() {
    if (!this.modal) return;
    $(this.modal).classList.add('hidden');
    this.modal = null;
    this.game.resumeFromModal();
  }

  openSockets(kase, tool) {
    const el = $('sockets');
    const list = [...kase.props.sockets].sort((a, b) => a - b);
    el.innerHTML = `<div class="panel"><h2>Socket case</h2><div class="sock-grid">${list.map((s) => `<button data-s="${s}" class="${tool.props.socket === s ? 'on' : ''}">${s} mm</button>`).join('')}</div>
      <div style="font-size:12px;color:#aaa;margin-top:6px">Sockets in the case: ${list.length}. Missing a size? Order it from the parts shop.</div><button id="sockClose">Close</button></div>`;
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { tool.props.socket = +b.dataset.s; this.game.audio.click(0.4); this.closeModal(); this.toast(`${b.dataset.s} mm socket fitted`); });
    $('sockClose').onclick = () => this.closeModal();
    this.openModal('sockets');
  }

  openInventory() {
    const g = this.game;
    const el = $('inventory');
    const render = () => {
      const items = g.inventory.map((u) => g.asm.get(u)).filter(Boolean);
      el.innerHTML = `<div class="panel"><h2>Pockets</h2>${items.length ? items.map((it) => `<div class="inv-item"><span>${it.def.name}${it.def.type === 'fluid' ? ` (${it.props.amount.toFixed(1)} L)` : ''}</span><button data-u="${it.uid}">Take out</button></div>`).join('') : '<div style="color:#999">Empty</div>'}
        <div style="font-size:12px;color:#aaa;margin:6px 0">Hold a small item and press Q to pocket it.</div><button id="invClose">Close</button></div>`;
      el.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => {
        if (g.interaction.held) { this.toast('Hands full — put something down first'); return; }
        const it = g.asm.get(b.dataset.u);
        g.inventory = g.inventory.filter((u) => u !== it.uid);
        g.interaction.hold(it);
        this.closeModal();
      });
      $('invClose').onclick = () => this.closeModal();
    };
    render();
    this.openModal('inventory');
  }

  // ---------- the computer ----------
  openComputer(tab = 'shop') {
    const g = this.game;
    const el = $('computer');
    const cats = {};
    for (const d of Object.values(DEFS)) if (d.shop) (cats[d.cat || 'Misc'] ||= []).push(d);
    const render = () => {
      let body = '';
      if (tab === 'shop') {
        body += `<div class="muted">Rautaosa Varaosat Oy — orders are delivered to the pallet outside your garage in about 2 hours. Delivery fee 25 mk per order. Basket total: <b>${fmtMoney(this.basketTotal())}</b> <button class="small" id="buy">Order basket</button> <button class="small" id="clear">Clear</button></div>`;
        body += `<div class="muted">Basket: ${g.basket.length ? g.basket.map((id) => DEFS[id].name).join(', ') : 'empty'}</div>`;
        for (const [c, list] of Object.entries(cats)) {
          body += `<div class="cat">${c}</div><table><tr><th>Item</th><th>Fits</th><th>Price</th><th></th></tr>`;
          for (const d of list) body += `<tr><td>${d.name}${d.desc ? `<div class="muted">${d.desc}</div>` : ''}</td><td class="muted">${d.kind === 'part' ? 'Ruska 1600' : '—'}</td><td>${fmtMoney(d.price)}</td><td><button data-add="${d.id}">Add</button></td></tr>`;
          body += '</table>';
        }
      } else if (tab === 'orders') {
        body += '<div class="cat">Deliveries</div>';
        if (!g.orders.length) body += '<div class="muted">No pending deliveries.</div>';
        for (const o of g.orders) body += `<div>Order #${o.id}: ${o.items.map((i) => DEFS[i].name).join(', ')} — arrives ${g.life.fmtTime(o.eta)}</div>`;
      } else if (tab === 'bank') {
        body += `<div class="cat">Osuuspankki — account of JC</div><div class="money">Balance: ${fmtMoney(g.money)}</div>`;
        body += `<div class="muted">Weekly bills (rent, electricity, insurance) are due every Monday: ${fmtMoney(g.life.weeklyBill)}.</div>`;
        body += '<div class="cat">Recent transactions</div>' + g.ledger.slice(-14).reverse().map((l) => `<div>${l.when} — ${l.text}: <b>${l.amount > 0 ? '+' : ''}${fmtMoney(l.amount)}</b></div>`).join('');
      } else if (tab === 'sell') {
        body += `<div class="cat">Tori.fi classifieds</div><div class="muted">Put things you want to sell on the delivery pallet outside the garage door. Buyers pay about 40–70% of new price depending on condition. They pick them up immediately.</div>`;
        const items = g.palletItems();
        if (!items.length) body += '<div style="margin-top:8px">Nothing on the pallet.</div>';
        else body += '<table><tr><th>Item</th><th>Condition</th><th>Offer</th><th></th></tr>' + items.map((it) => `<tr><td>${it.def.name}</td><td>${Math.round(it.cond * 100)}%</td><td>${fmtMoney(g.sellPrice(it))}</td><td><button data-sell="${it.uid}">Sell</button></td></tr>`).join('') + '</table>';
      } else if (tab === 'rally') {
        const R = g.rally;
        body += `<div class="cat">Suomen Ralliliitto</div><div>Reputation: <b>${R.rep}</b> · Championship points: <b>${R.points}</b></div><button class="small" id="openRally">Open the event list & standings</button>`;
        if (R.results.length) body += '<div class="cat">Your results</div>' + R.results.slice().reverse().map((r) => `<div>Day ${r.day + 1}: ${r.ev} — ${r.pos === 'DNF' ? 'DNF' : 'P' + r.pos + ', ' + R.fmt(r.t)}</div>`).join('');
      } else if (tab === 'jobs') {
        body += '<div class="cat">Work around Ruskala</div>' + g.jobs.list().map((j) => `<div style="margin:6px 0"><b>${j.title}</b> — ${j.pay}<div class="muted">${j.status}</div></div>`).join('');
      } else if (tab === 'help') {
        body += `<div class="cat">JC's notes</div><ol>
          <li>The engine is on the stand, half apart. The cylinder head is on the workbench.</li>
          <li>Hold <b>Tab</b> near the stand or the car to see what's missing. Fasteners light up: green tight, yellow loose, red missing.</li>
          <li>Ratchet + socket case are in the red toolbox (top drawer). With the ratchet in hand, press E on the socket case or use the mouse wheel near it to change sockets.</li>
          <li>Build order: bearings → crank (torque the caps) → rod bearings → pistons with rings & rods (arrow to the front!) → oil pump → oil pan → head gasket → head → timing gears with marks lined up → belt → covers → ancillaries → flywheel, clutch, gearbox.</li>
          <li>Unbolt the engine from the stand, lift it with the hoist (F at the hoist), roll it to the car, lower it onto the mounts.</li>
          <li>Connect hoses, wiring, fuel line, exhaust, cables. Fill oil, coolant, gear oil, brake fluid and petrol. Then turn the key (T in the car).</li>
          <li>No car yet? The moped outside gets you to Ruskala village (east along Route 54): parts store, shop, post office jobs, gas station, Esa's workshop, inspection and the Rally HQ.</li>
          <li>Money: parcels from the post office, mowing Pertti's lawn, scrap metal for Romu-Raimo (west), jobs at Esa's. Phone (P) calls a tow truck if you get stuck.</li>
          <li>Rallying: get the car inspected (Katsastus), enter events at the Rally HQ, drive to the START arch, press Enter. Practice any stage any time.</li>
        </ol>`;
      }
      el.innerHTML = `<div class="pc"><div class="bar"><span>Pentium 75 — ${tab === 'shop' ? 'Rautaosa.fi' : tab}</span><span>${fmtMoney(g.money)} <button id="pcClose">✕</button></span></div>
        <div class="tabs">${['shop', 'orders', 'sell', 'jobs', 'rally', 'bank', 'help'].map((t) => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${{ shop: 'Parts shop', orders: 'Deliveries', sell: 'Sell stuff', jobs: 'Jobs', rally: 'Rally', bank: 'Bank', help: 'Notes' }[t]}</button>`).join('')}</div>
        <div class="body">${body}</div></div>`;
      el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; render(); });
      el.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { g.basket.push(b.dataset.add); g.audio.click(0.3); render(); });
      const orl = $('openRally'); if (orl) orl.onclick = () => this.openRally();
      el.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => { g.sellItem(b.dataset.sell); render(); });
      const buy = $('buy'); if (buy) buy.onclick = () => { g.placeOrder(); render(); };
      const clr = $('clear'); if (clr) clr.onclick = () => { g.basket = []; render(); };
      $('pcClose').onclick = () => this.closeModal();
    };
    render();
    this.openModal('computer');
  }
  basketTotal() { return this.game.basket.reduce((s, id) => s + DEFS[id].price, 0) + (this.game.basket.length ? 25 : 0); }

  showResults(res) {
    const el = $('results');
    el.innerHTML = `<div class="panel"><h2>${res.ev} — results</h2><table class="keys">${res.rows.map((r, i) => `<tr style="${r.me || r.name === 'JC' ? 'color:#f2c14e;font-weight:bold' : ''}"><td>P${i + 1}</td><td>${r.name}</td><td>${this.game.rally.fmt(r.t)}</td></tr>`).join('')}</table><button id="resClose">Close</button></div>`;
    $('resClose').onclick = () => this.closeModal();
    this.openModal('results');
  }

  openMap() {
    const g = this.game;
    const c = $('mapcanvas'), x = c.getContext('2d');
    const S = c.width, sc = S / 1600, tx = (v) => (v + 800) * sc;
    x.fillStyle = '#3b5a32'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#2a4a6a'; x.beginPath(); x.arc(tx(LAKE.x), tx(LAKE.z), LAKE.r * sc * 1.3, 0, 7); x.fill();
    for (const r of ROADS) {
      x.strokeStyle = r.type === 'asphalt' ? '#ddd' : r.type === 'gravel' ? '#c8b08a' : '#9a7a58'; x.lineWidth = r.type === 'asphalt' ? 4 : 3;
      x.beginPath(); r.samples.forEach((p, i) => i ? x.lineTo(tx(p.x), tx(p.z)) : x.moveTo(tx(p.x), tx(p.z))); x.stroke();
      const m = r.samples[Math.floor(r.samples.length / 2)];
      x.fillStyle = '#fff'; x.font = '13px Arial'; x.fillText(r.name, tx(m.x) + 6, tx(m.z) - 6);
    }
    x.fillStyle = '#f2c14e'; x.fillRect(tx(-15), tx(-5), 21 * sc + 4, 10 * sc + 4); x.fillText('Home', tx(10), tx(-8));
    for (const st of Object.values(g.rally.stages)) {
      const s0 = st.samples[0];
      const next = st.id === g.rally.nextStageId();
      x.fillStyle = next ? '#ff3030' : st.def.rev ? '#40a0ff' : '#ff9020'; x.fillRect(tx(s0.x) - 4, tx(s0.z) - 4, 8, 8);
      x.fillStyle = next ? '#ff8080' : '#ffd090'; x.font = '11px Arial'; x.fillText((next ? 'NEXT: ' : '') + st.def.name, tx(s0.x) + 7, tx(s0.z) + (st.def.rev ? 22 : 12));
    }
    x.font = 'bold 15px Arial';
    for (const [n, px, pz] of [['RUSKALA', 565, 135], ['Romu-Raimo scrapyard', -470, 225], ['Pertti', -205, 112], ['Mäkelä farm', 330, 128], ['Gas', 482, 104], ['Service park', 632, 222]]) { x.fillStyle = '#000a'; x.fillText(n, tx(px) - 30 + 1, tx(pz) + 1); x.fillStyle = '#fff'; x.fillText(n, tx(px) - 30, tx(pz)); }
    for (const m of g.jobs.markers()) { x.fillStyle = m.c; x.beginPath(); x.arc(tx(m.x), tx(m.z), m.t ? 6 : 3, 0, 7); x.fill(); if (m.t) { x.font = '12px Arial'; x.fillText(m.t, tx(m.x) + 8, tx(m.z) - 6); } }
    const mp = g.moped.pos; x.fillStyle = '#9fe39a'; x.beginPath(); x.arc(tx(mp.x), tx(mp.z), 4, 0, 7); x.fill();
    const p = g.player.pos;
    x.fillStyle = '#ff4040'; x.beginPath(); x.arc(tx(p.x), tx(p.z), 6, 0, 7); x.fill();
    const cp = g.car.chassis.obj.position;
    x.fillStyle = '#40a0ff'; x.beginPath(); x.arc(tx(cp.x), tx(cp.z), 4, 0, 7); x.fill();
    this.openModal('mapscreen');
  }
}
